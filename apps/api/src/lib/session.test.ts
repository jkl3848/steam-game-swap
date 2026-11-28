import { describe, expect, it } from "vitest";
import {
  COOKIE_SESSION,
  cookieOptions,
  mergeSession,
  readCombinedSession,
  SESSION_MAX_AGE_SEC,
  sessionsFromToken,
  signCombinedSession,
  withoutParticipant,
} from "./session.js";

describe("session cookie", () => {
  it("uses the Firebase Hosting __session cookie name", () => {
    expect(COOKIE_SESSION).toBe("__session");
  });

  it("keeps the Discord login for 30 days", () => {
    expect(SESSION_MAX_AGE_SEC).toBe(60 * 60 * 24 * 30);
    expect(cookieOptions().maxAge).toBe(SESSION_MAX_AGE_SEC);
    expect(cookieOptions().httpOnly).toBe(true);
    expect(cookieOptions().path).toBe("/");
  });

  it("round-trips a creator session", async () => {
    const token = await mergeSession(undefined, { type: "creator", userId: "user-1" });
    await expect(sessionsFromToken(token)).resolves.toEqual({
      creator: { type: "creator", userId: "user-1" },
    });
  });

  it("merges a participant session onto an existing creator cookie", async () => {
    const creatorToken = await mergeSession(undefined, { type: "creator", userId: "user-1" });
    const combined = await mergeSession(creatorToken, {
      type: "participant",
      participantId: "p-1",
      swapId: "swap-1",
    });

    await expect(sessionsFromToken(combined)).resolves.toEqual({
      creator: { type: "creator", userId: "user-1" },
      participant: { type: "participant", participantId: "p-1", swapId: "swap-1" },
    });
  });

  it("drops the participant half and keeps the creator", async () => {
    const creatorToken = await mergeSession(undefined, { type: "creator", userId: "user-1" });
    const combined = await mergeSession(creatorToken, {
      type: "participant",
      participantId: "p-1",
      swapId: "swap-1",
    });
    const creatorOnly = await withoutParticipant(combined);
    await expect(sessionsFromToken(creatorOnly ?? undefined)).resolves.toEqual({
      creator: { type: "creator", userId: "user-1" },
    });
    await expect(withoutParticipant(undefined)).resolves.toBeNull();
  });

  it("returns nothing for a missing or invalid cookie", async () => {
    await expect(sessionsFromToken(undefined)).resolves.toEqual({});
    await expect(sessionsFromToken("not-a-jwt")).resolves.toEqual({});
    await expect(readCombinedSession("not-a-jwt")).resolves.toBeNull();
  });

  it("ignores a combined token with no usable claims", async () => {
    const token = await signCombinedSession({});
    await expect(readCombinedSession(token)).resolves.toBeNull();
  });
});
