import { describe, expect, it } from "vitest";
import { searchSteamStore } from "./steam.js";

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
