import { beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { mergeSession } from "../lib/session.js";
import {
  clearFirestoreEmulator,
  cookieHeaderFromResponse,
} from "../test/firestore-emulator.js";

const hasEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

async function creatorCookie(userId = "creator-1"): Promise<string> {
  const token = await mergeSession(undefined, { type: "creator", userId });
  return `__session=${token}`;
}

async function createOpenSwap(
  app: FastifyInstance,
  cookie: string,
  extra: Record<string, unknown> = {},
) {
  const res = await app.inject({
    method: "POST",
    url: "/api/swaps",
    headers: { cookie },
    payload: {
      title: "Friday swap",
      startDate: "2026-12-01",
      giftDeadline: "2026-12-20",
      autoMatch: true,
      ...extra,
    },
  });
  expect(res.statusCode).toBe(200);
  return res.json().swap as { id: string; code: string; title: string };
}

async function joinAs(
  app: FastifyInstance,
  code: string,
  person: { firstName: string; steamUsername: string; discordUserId: string },
) {
  const res = await app.inject({
    method: "POST",
    url: `/api/swaps/${code}/join`,
    payload: {
      firstName: person.firstName,
      steamUsername: person.steamUsername,
      discordUserId: person.discordUserId,
      discordTag: `${person.firstName}#0001`,
      wishlist: [],
    },
  });
  expect(res.statusCode).toBe(200);
  const body = res.json() as { participantId: string; participantUrl: string; code: string };
  const cookie = cookieHeaderFromResponse(res.headers["set-cookie"]);
  return { ...body, cookie };
}

describe.skipIf(!hasEmulator)("swap lifecycle", () => {
  beforeEach(async () => {
    await clearFirestoreEmulator();
  });

  it("creates a swap with numeric prices from the UI", async () => {
    const app = await buildApp();
    const cookie = await creatorCookie();
    try {
      const swap = await createOpenSwap(app, cookie, {
        priceMin: 15,
        priceMax: 40,
      });
      expect(swap.code).toMatch(/^[A-Z0-9]{6}$/);

      const get = await app.inject({ method: "GET", url: `/api/swaps/${swap.code}` });
      expect(get.statusCode).toBe(200);
      expect(get.json().swap).toMatchObject({
        title: "Friday swap",
        priceMin: 15,
        priceMax: 40,
        canJoin: true,
      });
    } finally {
      await app.close();
    }
  });

  it("creates a swap when prices are blank or omitted", async () => {
    const app = await buildApp();
    const cookie = await creatorCookie();
    try {
      const blank = await createOpenSwap(app, cookie, {
        priceMin: "",
        priceMax: null,
      });
      const omitted = await createOpenSwap(app, cookie, { title: "No prices" });

      const blankGet = await app.inject({ method: "GET", url: `/api/swaps/${blank.code}` });
      const omittedGet = await app.inject({ method: "GET", url: `/api/swaps/${omitted.code}` });
      expect(blankGet.json().swap.priceMin).toBeNull();
      expect(blankGet.json().swap.priceMax).toBeNull();
      expect(omittedGet.json().swap.priceMin).toBeNull();
      expect(omittedGet.json().swap.priceMax).toBeNull();
    } finally {
      await app.close();
    }
  });

  it("runs create → join → wishlist → blackout → match → assignment → mark-sent", async () => {
    const app = await buildApp();
    const creator = await creatorCookie();
    try {
      const swap = await createOpenSwap(app, creator, { priceMin: 10, priceMax: 30 });

      // Four people so a mutual Alice↔Bob blackout still leaves a valid derangement.
      const alice = await joinAs(app, swap.code, {
        firstName: "Alice",
        steamUsername: "alice_steam",
        discordUserId: "dev:alice",
      });
      const bob = await joinAs(app, swap.code, {
        firstName: "Bob",
        steamUsername: "bob_steam",
        discordUserId: "dev:bob",
      });
      const cara = await joinAs(app, swap.code, {
        firstName: "Cara",
        steamUsername: "cara_steam",
        discordUserId: "dev:cara",
      });
      const dan = await joinAs(app, swap.code, {
        firstName: "Dan",
        steamUsername: "dan_steam",
        discordUserId: "dev:dan",
      });

      const wishlist = await app.inject({
        method: "PUT",
        url: `/api/swaps/${swap.code}/me/wishlist`,
        headers: { cookie: alice.cookie },
        payload: {
          items: [
            {
              steamAppId: 400,
              name: "Portal",
              storeUrl: "https://store.steampowered.com/app/400",
              priceHint: "$9.99",
            },
          ],
        },
      });
      expect(wishlist.statusCode).toBe(200);
      expect(wishlist.json().wishlist).toHaveLength(1);

      const blackout = await app.inject({
        method: "POST",
        url: `/api/swaps/${swap.code}/blackouts`,
        headers: { cookie: creator },
        payload: {
          participantAId: alice.participantId,
          participantBId: bob.participantId,
        },
      });
      expect(blackout.statusCode).toBe(200);

      const lock = await app.inject({
        method: "PATCH",
        url: `/api/swaps/${swap.code}`,
        headers: { cookie: creator },
        payload: { status: "locked" },
      });
      expect(lock.statusCode).toBe(200);
      expect(lock.json().swap.status).toBe("locked");

      const match = await app.inject({
        method: "POST",
        url: `/api/swaps/${swap.code}/match`,
        headers: { cookie: creator },
      });
      expect(match.statusCode).toBe(200);
      expect(match.json()).toEqual({ ok: true });

      const assignment = await app.inject({
        method: "GET",
        url: `/api/swaps/${swap.code}/my-assignment`,
        headers: { cookie: alice.cookie },
      });
      expect(assignment.statusCode).toBe(200);
      expect(assignment.json().assignment).toMatchObject({
        receiver: {
          firstName: expect.any(String),
          steamUsername: expect.any(String),
        },
        priceMin: 10,
        priceMax: 30,
        sentAt: null,
      });
      expect(assignment.json().assignment.receiver.firstName).not.toBe("Alice");
      // Blackout: Alice must not gift Bob
      expect(assignment.json().assignment.receiver.firstName).not.toBe("Bob");

      const markSent = await app.inject({
        method: "POST",
        url: `/api/swaps/${swap.code}/mark-sent`,
        headers: { cookie: alice.cookie },
      });
      expect(markSent.statusCode).toBe(200);
      expect(markSent.json().sentAt).toBeTruthy();

      const manage = await app.inject({
        method: "GET",
        url: `/api/swaps/${swap.code}/manage`,
        headers: { cookie: creator },
      });
      expect(manage.statusCode).toBe(200);
      const aliceRow = manage.json().participants.find(
        (p: { id: string }) => p.id === alice.participantId,
      );
      expect(aliceRow.giftSent).toBeTruthy();
      expect(manage.json().assignments).toHaveLength(4);
      expect([bob.participantId, cara.participantId, dan.participantId].every(Boolean)).toBe(true);
    } finally {
      await app.close();
    }
  });

  it("rejects unauthenticated create", async () => {
    const app = await buildApp();
    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/swaps",
        payload: {
          title: "Nope",
          startDate: "2026-12-01",
          giftDeadline: "2026-12-20",
        },
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it("rejects join after lock", async () => {
    const app = await buildApp();
    const creator = await creatorCookie();
    try {
      const swap = await createOpenSwap(app, creator);
      await app.inject({
        method: "PATCH",
        url: `/api/swaps/${swap.code}`,
        headers: { cookie: creator },
        payload: { status: "locked" },
      });

      const join = await app.inject({
        method: "POST",
        url: `/api/swaps/${swap.code}/join`,
        payload: {
          firstName: "Late",
          steamUsername: "late_steam",
          discordUserId: "dev:late",
        },
      });
      expect(join.statusCode).toBe(400);
      expect(join.json().error).toMatch(/not accepting/i);
    } finally {
      await app.close();
    }
  });

  it("rejects match with fewer than 3 participants", async () => {
    const app = await buildApp();
    const creator = await creatorCookie();
    try {
      const swap = await createOpenSwap(app, creator);
      await joinAs(app, swap.code, {
        firstName: "Alice",
        steamUsername: "alice_steam",
        discordUserId: "dev:alice",
      });
      await joinAs(app, swap.code, {
        firstName: "Bob",
        steamUsername: "bob_steam",
        discordUserId: "dev:bob",
      });

      const match = await app.inject({
        method: "POST",
        url: `/api/swaps/${swap.code}/match`,
        headers: { cookie: creator },
      });
      expect(match.statusCode).toBe(400);
      expect(match.json().error).toMatch(/at least 3/i);
    } finally {
      await app.close();
    }
  });
});
