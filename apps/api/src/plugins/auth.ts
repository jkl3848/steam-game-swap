import type { FastifyInstance, FastifyRequest } from "fastify";
import { findSwapByCode, findParticipant } from "../db/swaps.js";
import {
  COOKIE_CREATOR,
  COOKIE_PARTICIPANT,
  verifySession,
  type CreatorSession,
  type ParticipantSession,
} from "../lib/session.js";

declare module "fastify" {
  interface FastifyRequest {
    creatorSession?: CreatorSession;
    participantSession?: ParticipantSession;
  }
}

export async function authPlugin(app: FastifyInstance) {
  app.decorateRequest("creatorSession", undefined);
  app.decorateRequest("participantSession", undefined);

  app.addHook("preHandler", async (request) => {
    const creatorToken = request.cookies[COOKIE_CREATOR];
    if (creatorToken) {
      const session = await verifySession(creatorToken);
      if (session?.type === "creator") {
        request.creatorSession = session;
      }
    }

    const participantToken = request.cookies[COOKIE_PARTICIPANT];
    if (participantToken) {
      const session = await verifySession(participantToken);
      if (session?.type === "participant") {
        request.participantSession = session;
      }
    }
  });
}

export function requireCreator(request: FastifyRequest) {
  if (!request.creatorSession) {
    const err = new Error("Unauthorized");
    (err as Error & { statusCode: number }).statusCode = 401;
    throw err;
  }
  return request.creatorSession;
}

export async function requireSwapCreator(
  request: FastifyRequest,
  swapCode: string,
) {
  const session = requireCreator(request);
  const swap = await findSwapByCode(swapCode);
  if (!swap) {
    const err = new Error("Swap not found");
    (err as Error & { statusCode: number }).statusCode = 404;
    throw err;
  }
  if (swap.creatorUserId !== session.userId) {
    const err = new Error("Forbidden");
    (err as Error & { statusCode: number }).statusCode = 403;
    throw err;
  }
  return swap;
}

export async function requireParticipantForSwap(
  request: FastifyRequest,
  swapId: string,
) {
  const session = request.participantSession;
  if (!session || session.swapId !== swapId) {
    const err = new Error("Unauthorized");
    (err as Error & { statusCode: number }).statusCode = 401;
    throw err;
  }
  const participant = await findParticipant(swapId, session.participantId);
  if (!participant) {
    const err = new Error("Participant not found");
    (err as Error & { statusCode: number }).statusCode = 404;
    throw err;
  }
  return participant;
}
