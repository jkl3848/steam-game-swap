import { beforeEach, describe, expect, it } from "vitest";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { buildApp } from "../app.js";
import { mergeSession } from "./session.js";
import {
  clearFirestoreEmulator,
  cookieHeaderFromResponse,
} from "../test/firestore-emulator.js";

/**
 * Integration-style test: participant session for swap A must not access swap B.
 * Runs when Firestore emulator is available (set FIRESTORE_EMULATOR_HOST).
 */
describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)("swap isolation", () => {
  beforeEach(async () => {
    await clearFirestoreEmulator();
  });

  it("returns 404 for an unknown swap code", async () => {
    const app = await buildApp();
    try {
      const res = await app.inject({
        method: "GET",
        url: "/api/swaps/FAKECODE/me",
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it("rejects cross-swap participant access", async () => {
    const app = await buildApp();
    const creatorToken = await mergeSession(undefined, {
      type: "creator",
      userId: "creator-iso",
    });
    const creatorCookie = `__session=${creatorToken}`;

    try {
      const swapA = await app.inject({
        method: "POST",
        url: "/api/swaps",
        headers: { cookie: creatorCookie },
        payload: {
          title: "Swap A",
          startDate: "2026-12-01",
          giftDeadline: "2026-12-20",
        },
      });
      const swapB = await app.inject({
        method: "POST",
        url: "/api/swaps",
        headers: { cookie: creatorCookie },
        payload: {
          title: "Swap B",
          startDate: "2026-12-01",
          giftDeadline: "2026-12-20",
        },
      });
      expect(swapA.statusCode).toBe(200);
      expect(swapB.statusCode).toBe(200);
      const codeA = swapA.json().swap.code as string;
      const codeB = swapB.json().swap.code as string;

      const joinA = await app.inject({
        method: "POST",
        url: `/api/swaps/${codeA}/join`,
        payload: {
          firstName: "Pat",
          steamUsername: "pat_steam",
          discordUserId: "dev:pat",
        },
      });
      expect(joinA.statusCode).toBe(200);
      const participantCookie = cookieHeaderFromResponse(joinA.headers["set-cookie"]);

      const cross = await app.inject({
        method: "GET",
        url: `/api/swaps/${codeB}/me`,
        headers: { cookie: participantCookie },
      });
      expect(cross.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });
});

describe("auth plugin", () => {
  it("leaves request without session when no cookie", async () => {
    const app = Fastify();
    await app.register(cookie);
    const { authPlugin } = await import("../plugins/auth.js");
    await authPlugin(app);
    app.get("/test", async (req) => ({
      hasCreator: !!req.creatorSession,
      hasParticipant: !!req.participantSession,
    }));
    const res = await app.inject({ method: "GET", url: "/test" });
    expect(res.json()).toEqual({ hasCreator: false, hasParticipant: false });
    expect(res.headers["cache-control"]).toBe("private");
    await app.close();
  });

  it("keeps __session on a login redirect response", async () => {
    const { setSessionCookie } = await import("./session.js");
    const app = Fastify();
    await app.register(cookie);
    app.get("/go", async (request, reply) => {
      await setSessionCookie(request, reply, { type: "creator", userId: "user-1" });
      return reply.redirect("/dashboard");
    });
    const res = await app.inject({ method: "GET", url: "/go" });
    const header = Array.isArray(res.headers["set-cookie"])
      ? res.headers["set-cookie"].join("\n")
      : String(res.headers["set-cookie"] ?? "");
    expect(res.statusCode).toBe(302);
    expect(header).toContain("__session=");
    await app.close();
  });

  it("writes login onto the __session cookie Firebase Hosting forwards", async () => {
    const { setSessionCookie } = await import("./session.js");
    const app = Fastify();
    await app.register(cookie);
    app.post("/login", async (request, reply) => {
      await setSessionCookie(request, reply, { type: "creator", userId: "user-1" });
      return { ok: true };
    });
    const res = await app.inject({ method: "POST", url: "/login" });
    const setCookie = res.headers["set-cookie"];
    const header = Array.isArray(setCookie) ? setCookie.join("\n") : String(setCookie ?? "");
    expect(header).toContain("__session=");
    expect(header).not.toContain("sgs_creator=");
    await app.close();
  });

  it("reads creator session from the __session cookie", async () => {
    const { mergeSession } = await import("./session.js");
    const token = await mergeSession(undefined, { type: "creator", userId: "user-1" });
    const app = Fastify();
    await app.register(cookie);
    const { authPlugin } = await import("../plugins/auth.js");
    await authPlugin(app);
    app.get("/test", async (req) => ({
      userId: req.creatorSession?.userId ?? null,
    }));
    const res = await app.inject({
      method: "GET",
      url: "/test",
      cookies: { __session: token },
    });
    expect(res.json()).toEqual({ userId: "user-1" });
    await app.close();
  });
});
