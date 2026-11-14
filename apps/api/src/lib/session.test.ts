import { describe, expect, it } from "vitest";
import {
  COOKIE_SESSION,
  mergeSession,
  readCombinedSession,
  sessionsFromToken,
  signCombinedSession,
} from "./session.js";

describe("session cookie", () => {
  it("uses the Firebase Hosting __session cookie name", () => {
    expect(COOKIE_SESSION).toBe("__session");
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
