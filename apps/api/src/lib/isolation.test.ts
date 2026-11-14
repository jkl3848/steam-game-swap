import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { buildApp } from "../app.js";

/**
 * Integration-style test: participant session for swap A must not access swap B.
 * Runs when Firestore emulator is available (set FIRESTORE_EMULATOR_HOST).
 */
describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)("swap isolation", () => {
  it("rejects cross-swap participant access", async () => {
    const app = await buildApp();
    await app.ready();

    const res = await app.inject({
      method: "GET",
      url: "/api/swaps/FAKECODE/me",
    });
    expect(res.statusCode).toBe(401);

    await app.close();
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
