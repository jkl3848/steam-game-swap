import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { createSwapSchema } from "@steam-game-swap/shared";
import { mergeSession } from "./lib/session.js";

describe("create swap request", () => {
  it("answers a JSON POST instead of hanging", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/swaps",
      payload: {
        title: "Friday swap",
        startDate: "2026-12-01",
        giftDeadline: "2026-12-20",
        priceMin: "",
        priceMax: null,
      },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: "Unauthorized" });
    await app.close();
  });

  it("returns a readable validation error for a signed-in creator", async () => {
    const token = await mergeSession(undefined, { type: "creator", userId: "user-1" });
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/swaps",
      headers: { cookie: `__session=${token}` },
      payload: { title: "Friday swap" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBeTruthy();
    await app.close();
  });

  it("treats blank prices as unset", () => {
    const parsed = createSwapSchema.parse({
      title: "Friday swap",
      startDate: "2026-12-01",
      giftDeadline: "2026-12-20",
      priceMin: "",
      priceMax: null,
      autoMatch: true,
      discordInviteUrl: "https://discord.gg/example",
    });
    expect(parsed.priceMin).toBeUndefined();
    expect(parsed.priceMax).toBeUndefined();
  });

  it("accepts numeric prices from the create form", () => {
    const parsed = createSwapSchema.parse({
      title: "Friday swap",
      startDate: "2026-12-01",
      giftDeadline: "2026-12-20",
      priceMin: 15,
      priceMax: 40,
      autoMatch: true,
      discordInviteUrl: "https://discord.gg/example",
    });
    expect(parsed.priceMin).toBe(15);
    expect(parsed.priceMax).toBe(40);
  });

  it("allows omitted prices", () => {
    const parsed = createSwapSchema.parse({
      title: "Friday swap",
      startDate: "2026-12-01",
      giftDeadline: "2026-12-20",
      discordInviteUrl: "https://discord.gg/example",
    });
    expect(parsed.priceMin).toBeUndefined();
    expect(parsed.priceMax).toBeUndefined();
    expect(parsed.autoMatch).toBe(true);
  });
});

describe("dev participant tools", () => {
  it("hides dev routes when DEV_TOOLS is off", async () => {
    const previous = process.env.DEV_TOOLS;
    process.env.DEV_TOOLS = "false";
    const app = await buildApp();
    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/swaps/ABC123/dev/participants",
        payload: { firstName: "Sam" },
      });
      expect(res.statusCode).toBe(404);
    } finally {
      if (previous === undefined) delete process.env.DEV_TOOLS;
      else process.env.DEV_TOOLS = previous;
      await app.close();
    }
  });
});
