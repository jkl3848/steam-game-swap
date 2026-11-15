import { SignJWT, jwtVerify } from "jose";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";

const encoder = new TextEncoder();
const secret = () => encoder.encode(config.sessionSecret);

export type CreatorSession = {
  type: "creator";
  userId: string;
};

export type ParticipantSession = {
  type: "participant";
  participantId: string;
  swapId: string;
};

export type SessionPayload = CreatorSession | ParticipantSession;

/**
 * Firebase Hosting only forwards a cookie named `__session` to Cloud Functions.
 * Creator + participant claims share that one cookie.
 */
export const COOKIE_SESSION = "__session";
/** @deprecated Hosting strips this name; kept only to clear old cookies. */
export const COOKIE_CREATOR = "sgs_creator";
/** @deprecated Hosting strips this name; kept only to clear old cookies. */
export const COOKIE_PARTICIPANT = "sgs_participant";

type CombinedSession = {
  userId?: string;
  participantId?: string;
  swapId?: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export async function signCombinedSession(session: CombinedSession): Promise<string> {
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
}

export async function readCombinedSession(token: string): Promise<CombinedSession | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    const session: CombinedSession = {};
    if (isNonEmptyString(payload.userId)) session.userId = payload.userId;
    if (isNonEmptyString(payload.participantId)) session.participantId = payload.participantId;
    if (isNonEmptyString(payload.swapId)) session.swapId = payload.swapId;
    if (!session.userId && !(session.participantId && session.swapId)) return null;
    return session;
  } catch {
    return null;
  }
}

export async function mergeSession(
  existingToken: string | undefined,
  payload: SessionPayload,
): Promise<string> {
  const existing = existingToken ? await readCombinedSession(existingToken) : null;
  const next: CombinedSession = { ...existing };
  if (payload.type === "creator") {
    next.userId = payload.userId;
  } else {
    next.participantId = payload.participantId;
    next.swapId = payload.swapId;
  }
  return signCombinedSession(next);
}

export async function sessionsFromToken(token: string | undefined): Promise<{
  creator?: CreatorSession;
  participant?: ParticipantSession;
}> {
  if (!token) return {};
  const combined = await readCombinedSession(token);
  if (!combined) return {};
  return {
    ...(combined.userId ? { creator: { type: "creator" as const, userId: combined.userId } } : {}),
    ...(combined.participantId && combined.swapId
      ? {
          participant: {
            type: "participant" as const,
            participantId: combined.participantId,
            swapId: combined.swapId,
          },
        }
      : {}),
  };
}

export function cookieOptions(maxAgeSec = 60 * 60 * 24 * 30) {
  return {
    httpOnly: true,
    secure: config.isProd,
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSec,
  };
}

export function clearCookieOptions() {
  return {
    httpOnly: true,
    secure: config.isProd,
    sameSite: "lax" as const,
    path: "/",
  };
}

export function sessionCookieFromRequest(request: FastifyRequest): string | undefined {
  const parsed = request.cookies?.[COOKIE_SESSION];
  if (parsed) return parsed;
  const header = request.headers.cookie;
  if (typeof header !== "string") return undefined;
  const match = header.match(/(?:^|;\s*)__session=([^;]*)/);
  if (!match?.[1]) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/** Keep the creator login and drop the participant half of the cookie. */
export async function withoutParticipant(existingToken: string | undefined): Promise<string | null> {
  const existing = existingToken ? await readCombinedSession(existingToken) : null;
  if (!existing?.userId) return null;
  return signCombinedSession({ userId: existing.userId });
}

export async function clearParticipantCookie(request: FastifyRequest, reply: FastifyReply) {
  const token = await withoutParticipant(sessionCookieFromRequest(request));
  reply.header("Cache-Control", "private, no-store");
  if (!token) {
    clearSessionCookie(reply);
    return;
  }
  reply.setCookie(COOKIE_SESSION, token, cookieOptions());
}

export async function setSessionCookie(
  request: FastifyRequest,
  reply: FastifyReply,
  payload: SessionPayload,
) {
  const token = await mergeSession(sessionCookieFromRequest(request), payload);
  reply.header("Cache-Control", "private, no-store");
  reply.setCookie(COOKIE_SESSION, token, cookieOptions());
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(COOKIE_SESSION, clearCookieOptions());
  reply.clearCookie(COOKIE_CREATOR, clearCookieOptions());
  reply.clearCookie(COOKIE_PARTICIPANT, clearCookieOptions());
}
