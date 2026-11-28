import { config } from "../config.js";

export type SteamSearchResult = {
  steamAppId: number;
  name: string;
  storeUrl: string;
  priceHint?: string;
};

const FETCH_TIMEOUT_MS = 15_000;

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
