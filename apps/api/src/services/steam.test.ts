import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const configState = vi.hoisted(() => ({
  steamApiKey: "" as string,
}));

vi.mock("../config.js", () => ({
  config: {
    get steamApiKey() {
      return configState.steamApiKey;
    },
    isProd: false,
  },
}));

import { importWishlist, searchSteamStore, SteamWishlistError } from "./steam.js";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  configState.steamApiKey = "";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("importWishlist", () => {
  it("throws NO_API_KEY when store is unavailable and Web API key is missing", async () => {
    globalThis.fetch = vi.fn(async () => new Response("gone", { status: 404 }));

    await expect(importWishlist("76561198000000000")).rejects.toMatchObject({
      code: "NO_API_KEY",
    } as Partial<SteamWishlistError>);
    await expect(importWishlist("76561198000000000")).rejects.toBeInstanceOf(
      SteamWishlistError,
    );
  });

  it("imports a public store wishlist even when the Web API would be empty", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("wishlistdata")) {
        return jsonResponse({
          "400": { name: "Portal", subs: [{ price: "999" }] },
          "620": { name: "Portal 2", subs: [{ price: "999" }] },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const items = await importWishlist("76561198000000000");
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.name).sort()).toEqual(["Portal", "Portal 2"]);
    expect(items[0]?.storeUrl).toContain("store.steampowered.com/app/");
  });

  it("reports empty or private when the store returns an empty list", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("wishlistdata")) {
        return jsonResponse([]);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    await expect(importWishlist("76561198000000000")).rejects.toMatchObject({
      code: "EMPTY_OR_PRIVATE",
    });
  });

  it("reports a connection error when Steam cannot be reached", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("fetch failed");
    });

    await expect(importWishlist("76561198000000000")).rejects.toMatchObject({
      code: "CONNECTION_ERROR",
    });
  });

  it("pages a large store wishlist and stops when pages stop adding games", async () => {
    const page0: Record<string, { name: string }> = {};
    for (let i = 1; i <= 50; i++) {
      page0[String(1000 + i)] = { name: `Game ${i}` };
    }
    const page1: Record<string, { name: string }> = {};
    for (let i = 51; i <= 120; i++) {
      page1[String(1000 + i)] = { name: `Game ${i}` };
    }

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (!url.pathname.includes("wishlistdata")) {
        throw new Error(`Unexpected fetch: ${url}`);
      }
      const page = url.searchParams.get("p") ?? "0";
      if (page === "0") return jsonResponse(page0);
      if (page === "1") return jsonResponse(page1);
      return jsonResponse({});
    });

    const items = await importWishlist("76561198000000000");
    expect(items).toHaveLength(120);
    expect(items[0]?.name).toBe("Game 1");
    expect(items[119]?.name).toBe("Game 120");
  });

  it("falls back to the Web API when the store endpoint is unavailable", async () => {
    configState.steamApiKey = "test-key";
    let appdetailsCalls = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("wishlistdata")) {
        return new Response("<html>gone</html>", { status: 404 });
      }
      if (url.includes("IWishlistService/GetWishlist")) {
        return jsonResponse({
          response: { items: [{ appid: 400 }, { appid: 620 }] },
        });
      }
      if (url.includes("appdetails")) {
        appdetailsCalls++;
        const appId = url.includes("appids=400") ? 400 : 620;
        return jsonResponse({
          [String(appId)]: {
            success: true,
            data: {
              name: appId === 400 ? "Portal" : "Portal 2",
              price_overview: { final_formatted: "$9.99" },
            },
          },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const items = await importWishlist("76561198000000000");
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.name).sort()).toEqual(["Portal", "Portal 2"]);
    expect(appdetailsCalls).toBe(2);
  });
});

describe("searchSteamStore", () => {
  it("returns named store results for a common query", async () => {
    const results = await searchSteamStore("portal");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toMatchObject({
      steamAppId: expect.any(Number),
      name: expect.any(String),
      storeUrl: expect.stringContaining("store.steampowered.com/app/"),
    });
  }, 15_000);
});
