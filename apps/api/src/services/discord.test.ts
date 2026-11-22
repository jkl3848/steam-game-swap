import { describe, expect, it } from "vitest";
import {
  buildCancelDm,
  buildMatchDm,
  buildSignupDm,
  steamProfileUrl,
} from "./discord.js";

describe("steamProfileUrl", () => {
  it("uses profiles path for a 17-digit steam id", () => {
    expect(steamProfileUrl("76561198000000000", "someone")).toBe(
      "https://steamcommunity.com/profiles/76561198000000000",
    );
  });

  it("falls back to vanity id when steam id is missing", () => {
    expect(steamProfileUrl(null, "cool_gamer")).toBe(
      "https://steamcommunity.com/id/cool_gamer",
    );
  });
});

describe("buildMatchDm", () => {
  it("includes name, steam profile, steps, and dashboard link", () => {
    const dm = buildMatchDm({
      swapTitle: "Holiday Swap",
      gifteeFirstName: "Alex",
      steamUsername: "alex_steam",
      steamProfileUrl: "https://steamcommunity.com/id/alex_steam",
      discordTag: "alex#1234",
      priceMin: 10,
      priceMax: 30,
      myPageUrl: "https://example.com/s/ABCD12/me",
    });

    expect(dm).toContain("You're gifting for **Alex**");
    expect(dm).toContain("Steam: **alex_steam**");
    expect(dm).toContain("[Steam profile](https://steamcommunity.com/id/alex_steam)");
    expect(dm).toContain("1. Friend them on Steam");
    expect(dm).toContain("2. Once they accept, send their gift through Steam");
    expect(dm).toContain("https://example.com/s/ABCD12/me");
    expect(dm).toContain("**Price range:** $10 – $30");
    expect(dm).not.toContain("**Wishlist:**");
  });
});

describe("buildSignupDm", () => {
  it("includes the per-swap discord invite when provided", () => {
    const dm = buildSignupDm({
      swapTitle: "Holiday Swap",
      code: "ABCD12",
      discordInviteUrl: "https://discord.gg/swap",
    });
    expect(dm).toContain("https://discord.gg/swap");
  });
});

describe("buildCancelDm", () => {
  it("names the cancelled swap", () => {
    const dm = buildCancelDm({ swapTitle: "Holiday Swap", code: "ABCD12" });
    expect(dm).toContain("Holiday Swap");
    expect(dm).toContain("cancelled");
  });
});
