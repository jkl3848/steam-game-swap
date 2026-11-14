import { describe, expect, it } from "vitest";
import { importWishlist, searchSteamStore, SteamWishlistError } from "./steam.js";

describe("importWishlist", () => {
  it("throws when Steam API key is not configured", async () => {
    await expect(importWishlist("76561198000000000")).rejects.toMatchObject({
      name: "Error",
      code: "NO_API_KEY",
    } as Partial<SteamWishlistError>);
    await expect(importWishlist("76561198000000000")).rejects.toBeInstanceOf(
      SteamWishlistError,
    );
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
