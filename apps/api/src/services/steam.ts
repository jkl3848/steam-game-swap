import { config } from "../config.js";

export type SteamSearchResult = {
  steamAppId: number;
  name: string;
  storeUrl: string;
  priceHint?: string;
};

export async function searchSteamStore(query: string): Promise<SteamSearchResult[]> {
  const url = new URL("https://store.steampowered.com/api/storesearch/");
  url.searchParams.set("term", query);
  url.searchParams.set("cc", "US");
  url.searchParams.set("l", "english");

  const res = await fetch(url.toString());
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

  const res = await fetch(vanityUrl.toString());
  if (!res.ok) return null;

  const data = (await res.json()) as { response?: { success?: number; steamid?: string } };
  if (data.response?.success === 1 && data.response.steamid) {
    return data.response.steamid;
  }
  return null;
}

export async function importWishlist(steamId: string): Promise<SteamSearchResult[]> {
  const url = new URL(
    "https://api.steampowered.com/IWishlistService/GetWishlist/v1/",
  );
  url.searchParams.set("steamid", steamId);

  const res = await fetch(url.toString());
  if (!res.ok) return [];

  const data = (await res.json()) as {
    response?: {
      items?: Array<{ appid: number }>;
    };
  };

  const items = data.response?.items ?? [];
  const results: SteamSearchResult[] = [];

  for (const item of items.slice(0, 30)) {
    const appId = item.appid;
    const details = await fetchAppDetails(appId);
    results.push({
      steamAppId: appId,
      name: details?.name ?? `App ${appId}`,
      storeUrl: `https://store.steampowered.com/app/${appId}`,
      priceHint: details?.price,
    });
  }

  return results;
}

async function fetchAppDetails(
  appId: number,
): Promise<{ name: string; price?: string } | null> {
  try {
    const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=US`;
    const res = await fetch(url);
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
