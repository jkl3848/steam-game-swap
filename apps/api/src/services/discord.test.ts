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

  it("says and up when only a minimum price is set", () => {
    const dm = buildMatchDm({
      swapTitle: "Holiday Swap",
      gifteeFirstName: "Alex",
      steamUsername: "alex_steam",
      steamProfileUrl: "https://steamcommunity.com/id/alex_steam",
      priceMin: 15,
      priceMax: null,
      myPageUrl: "https://example.com/s/ABCD12/me",
    });
    expect(dm).toContain("**$15 and up**");
    expect(dm).not.toContain("Price range");
  });

  it("says less than when only a maximum price is set", () => {
    const dm = buildMatchDm({
      swapTitle: "Holiday Swap",
      gifteeFirstName: "Alex",
      steamUsername: "alex_steam",
      steamProfileUrl: "https://steamcommunity.com/id/alex_steam",
      priceMin: null,
      priceMax: 30,
      myPageUrl: "https://example.com/s/ABCD12/me",
    });
    expect(dm).toContain("**less than $30**");
    expect(dm).not.toContain("Price range");
  });
});

describe("buildSignupDm", () => {
  it("confirms the signup without a discord server link", () => {
    const dm = buildSignupDm({
      swapTitle: "Holiday Swap",
      code: "ABCD12",
    });
    expect(dm).toContain("You're signed up for **Holiday Swap**");
    expect(dm).toContain("`ABCD12`");
    expect(dm).not.toContain("discord.gg");
    expect(dm).not.toContain("Stay in the swap Discord");
  });
});

describe("buildCancelDm", () => {
  it("names the cancelled swap", () => {
    const dm = buildCancelDm({ swapTitle: "Holiday Swap", code: "ABCD12" });
    expect(dm).toContain("Holiday Swap");
    expect(dm).toContain("cancelled");
  });
});
