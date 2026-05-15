import { SignJWT, jwtVerify } from "jose";
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

const COOKIE_CREATOR = "sgs_creator";
const COOKIE_PARTICIPANT = "sgs_participant";

export { COOKIE_CREATOR, COOKIE_PARTICIPANT };

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.type === "creator" && typeof payload.userId === "string") {
      return { type: "creator", userId: payload.userId };
    }
    if (
      payload.type === "participant" &&
      typeof payload.participantId === "string" &&
      typeof payload.swapId === "string"
    ) {
      return {
        type: "participant",
        participantId: payload.participantId,
        swapId: payload.swapId,
      };
    }
    return null;
  } catch {
    return null;
  }
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
