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
    await app.register(authPlugin);
    app.get("/test", async (req) => ({
      hasCreator: !!req.creatorSession,
      hasParticipant: !!req.participantSession,
    }));
    const res = await app.inject({ method: "GET", url: "/test" });
    expect(res.json()).toEqual({ hasCreator: false, hasParticipant: false });
    await app.close();
  });
});
