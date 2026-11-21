import { config } from "../config.js";

export type SteamSearchResult = {
  steamAppId: number;
  name: string;
  storeUrl: string;
  priceHint?: string;
};

/** Max games we import / store per participant wishlist. */
export const WISHLIST_MAX = 500;

const FETCH_TIMEOUT_MS = 15_000;
const STORE_PAGE_SIZE_HINT = 50;

export async function searchSteamStore(query: string): Promise<SteamSearchResult[]> {
  const url = new URL("https://store.steampowered.com/api/storesearch/");
  url.searchParams.set("term", query);
  url.searchParams.set("cc", "US");
  url.searchParams.set("l", "english");

  const res = await fetchWithTimeout(url.toString());
  if (!res.ok) return [];

  const data = (await res.json()) as {
    items?: Array<{
      id: number;
      name: string;
      price?: { final?: number };
    }>;
  };

  return (data.items ?? [])
    .filter((item) => item.id && item.name)
    .slice(0, 15)
    .map((item) => ({
      steamAppId: item.id,
      name: item.name,
      storeUrl: `https://store.steampowered.com/app/${item.id}`,
      priceHint: item.price?.final
        ? `$${(item.price.final / 100).toFixed(2)}`
        : undefined,
    }));
}

export async function resolveSteamId(username: string): Promise<string | null> {
  if (!config.steamApiKey) return null;

  const trimmed = username.trim();
  if (/^\d{17}$/.test(trimmed)) return trimmed;

  const vanityUrl = new URL(
    "https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/",
  );
  vanityUrl.searchParams.set("key", config.steamApiKey);
  vanityUrl.searchParams.set("vanityurl", trimmed);

  try {
    const res = await fetchWithTimeout(vanityUrl.toString());
    if (!res.ok) return null;

    const data = (await res.json()) as { response?: { success?: number; steamid?: string } };
    if (data.response?.success === 1 && data.response.steamid) {
      return data.response.steamid;
    }
    return null;
  } catch {
    return null;
  }
}

export class SteamWishlistError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
  }
}

type WishlistFetchOutcome =
  | { kind: "ok"; items: SteamSearchResult[] }
  | { kind: "empty" }
  | { kind: "connection" }
  | { kind: "unavailable" };

export async function importWishlist(steamId: string): Promise<SteamSearchResult[]> {
  const store = await withRetry(() => importWishlistFromStore(steamId));

  if (store.kind === "ok") {
    return store.items.slice(0, WISHLIST_MAX);
  }
  if (store.kind === "empty") {
    throw new SteamWishlistError(
      "Wishlist is empty or private. Add games with search instead.",
      "EMPTY_OR_PRIVATE",
    );
  }

  // Store unavailable or connection issue — fall back to Web API.
  const web = await withRetry(() => importWishlistFromWebApi(steamId));

  if (web.kind === "ok") {
    return web.items.slice(0, WISHLIST_MAX);
  }
  if (web.kind === "empty") {
    throw new SteamWishlistError(
      "Wishlist is empty or private. Add games with search instead.",
      "EMPTY_OR_PRIVATE",
    );
  }

  if (store.kind === "connection" || web.kind === "connection") {
    throw new SteamWishlistError(
      "Could not reach Steam. Try again in a moment, or add games with search.",
      "CONNECTION_ERROR",
    );
  }

  if (!config.steamApiKey && web.kind === "unavailable") {
    throw new SteamWishlistError(
      "Steam Web API key is not configured. Search for games by name instead.",
      "NO_API_KEY",
    );
  }

  throw new SteamWishlistError(
    "Could not load Steam wishlist. Make sure the profile and wishlist are public.",
    "WISHLIST_UNAVAILABLE",
  );
}

/**
 * Public store wishlist — includes names, no API key, paginated.
 * Empty `[]` / `{}` on page 0 means private or empty.
 */
async function importWishlistFromStore(steamId: string): Promise<WishlistFetchOutcome> {
  const byAppId = new Map<number, SteamSearchResult>();

  try {
    for (let page = 0; page < 20 && byAppId.size < WISHLIST_MAX; page++) {
      const url = new URL(
        `https://store.steampowered.com/wishlist/profiles/${steamId}/wishlistdata/`,
      );
      url.searchParams.set("p", String(page));
      url.searchParams.set("v", "23");

      const res = await fetchWithTimeout(url.toString());
      if (!res.ok) {
        // 4xx/5xx — store endpoint may be gone or blocked.
        return page === 0 && byAppId.size === 0
          ? { kind: "unavailable" }
          : { kind: "ok", items: [...byAppId.values()] };
      }

      const text = await res.text();
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        return page === 0 && byAppId.size === 0
          ? { kind: "unavailable" }
          : { kind: "ok", items: [...byAppId.values()] };
      }

      if (Array.isArray(data)) {
        if (data.length === 0) {
          return page === 0 ? { kind: "empty" } : { kind: "ok", items: [...byAppId.values()] };
        }
        // Unexpected array of items — stop.
        return { kind: "unavailable" };
      }

      if (!data || typeof data !== "object") {
        return page === 0 ? { kind: "empty" } : { kind: "ok", items: [...byAppId.values()] };
      }

      const entries = Object.entries(data as Record<string, StoreWishlistEntry>);
      if (entries.length === 0) {
        return page === 0 ? { kind: "empty" } : { kind: "ok", items: [...byAppId.values()] };
      }

      let added = 0;
      for (const [appIdStr, entry] of entries) {
        const appId = Number(appIdStr);
        if (!Number.isFinite(appId) || byAppId.has(appId)) continue;
        byAppId.set(appId, {
          steamAppId: appId,
          name: entry?.name?.trim() || `App ${appId}`,
          storeUrl: `https://store.steampowered.com/app/${appId}`,
          priceHint: priceHintFromStoreEntry(entry),
        });
        added++;
        if (byAppId.size >= WISHLIST_MAX) break;
      }

      // Steam sometimes repeats the full list on later pages.
      if (added === 0) break;
      // Typical page size is ~50; fewer means last page.
      if (entries.length < STORE_PAGE_SIZE_HINT) break;
    }

    if (byAppId.size === 0) return { kind: "empty" };
    return { kind: "ok", items: [...byAppId.values()] };
  } catch {
    return { kind: "connection" };
  }
}

type StoreWishlistEntry = {
  name?: string;
  subs?: Array<{ price?: string | number; discount_pct?: number | null }>;
  is_free_game?: boolean;
};

function priceHintFromStoreEntry(entry: StoreWishlistEntry | undefined): string | undefined {
  if (!entry) return undefined;
  if (entry.is_free_game) return "Free";
  const sub = entry.subs?.[0];
  if (!sub?.price) return undefined;
  const cents = typeof sub.price === "string" ? Number(sub.price) : sub.price;
  if (!Number.isFinite(cents)) return undefined;
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * IWishlistService/GetWishlist — app ids only; enrich with batched store appdetails.
 */
async function importWishlistFromWebApi(steamId: string): Promise<WishlistFetchOutcome> {
  if (!config.steamApiKey) {
    return { kind: "unavailable" };
  }

  const url = new URL("https://api.steampowered.com/IWishlistService/GetWishlist/v1/");
  url.searchParams.set("steamid", steamId);
  url.searchParams.set("key", config.steamApiKey);

  try {
    const res = await fetchWithTimeout(url.toString());
    if (!res.ok) {
      return res.status >= 500 || res.status === 429
        ? { kind: "connection" }
        : { kind: "unavailable" };
    }

    const data = (await res.json()) as {
      response?: {
        items?: Array<{ appid: number }>;
      };
    };

    const items = data.response?.items ?? [];
    if (items.length === 0) {
      return { kind: "empty" };
    }

    const appIds = items
      .map((item) => item.appid)
      .filter((id) => Number.isFinite(id))
      .slice(0, WISHLIST_MAX);

    const details = await fetchAppDetailsBatch(appIds);
    const results: SteamSearchResult[] = appIds.map((appId) => {
      const d = details.get(appId);
      return {
        steamAppId: appId,
        name: d?.name ?? `App ${appId}`,
        storeUrl: `https://store.steampowered.com/app/${appId}`,
        priceHint: d?.price,
      };
    });

    return { kind: "ok", items: results };
  } catch {
    return { kind: "connection" };
  }
}

async function fetchAppDetailsBatch(
  appIds: number[],
): Promise<Map<number, { name: string; price?: string }>> {
  const out = new Map<number, { name: string; price?: string }>();
  const concurrency = 8;
  let index = 0;

  async function worker() {
    while (index < appIds.length) {
      const i = index++;
      const appId = appIds[i]!;
      const details = await fetchAppDetails(appId);
      if (details) out.set(appId, details);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, appIds.length) }, () => worker()),
  );
  return out;
}

async function fetchAppDetails(
  appId: number,
): Promise<{ name: string; price?: string } | null> {
  try {
    const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=US`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    const data = (await res.json()) as Record<
      string,
      { success?: boolean; data?: { name?: string; price_overview?: { final_formatted?: string } } }
    >;
    const entry = data[String(appId)];
    if (!entry?.success || !entry.data?.name) return null;
    return {
      name: entry.data.name,
      price: entry.data.price_overview?.final_formatted,
    };
  } catch {
    return null;
  }
}

/** Retry once when Steam returns a connection-shaped outcome. */
async function withRetry(
  fn: () => Promise<WishlistFetchOutcome>,
): Promise<WishlistFetchOutcome> {
  const first = await fn();
  if (first.kind !== "connection") return first;
  return fn();
}

async function fetchWithTimeout(
  url: string,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
