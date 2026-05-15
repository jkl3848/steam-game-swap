import type { FastifyInstance } from "fastify";
import {
  blackoutSchema,
  createSwapSchema,
  joinSwapSchema,
  updateParticipantSchema,
  updateSwapSchema,
  wishlistUpdateSchema,
} from "@steam-game-swap/shared";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { generateSwapCode } from "../lib/codes.js";
import {
  COOKIE_PARTICIPANT,
  cookieOptions,
  signSession,
} from "../lib/session.js";
import { generateSecretToken, hashToken, verifyToken } from "../lib/tokens.js";
import {
  requireCreator,
  requireParticipantForSwap,
  requireSwapCreator,
} from "../plugins/auth.js";
import { resolveSteamId } from "../services/steam.js";
import { buildSignupDm, sendDirectMessage } from "../services/discord.js";
import { MatchError, runSwapMatching } from "../services/swap-match.js";
import { isMatchingPossible } from "../lib/matcher.js";

function parseDate(input: string): Date {
  if (input.includes("T")) return new Date(input);
  return new Date(`${input}T12:00:00.000Z`);
}

export async function swapRoutes(app: FastifyInstance) {
  app.get("/swaps/mine", async (request) => {
    requireCreator(request);
    const swaps = await prisma.swap.findMany({
      where: { creatorUserId: request.creatorSession!.userId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { participants: true } } },
    });
    return {
      swaps: swaps.map((s) => ({
        id: s.id,
        code: s.code,
        title: s.title,
        status: s.status,
        startDate: s.startDate,
        giftDeadline: s.giftDeadline,
        participantCount: s._count.participants,
        autoMatch: s.autoMatch,
      })),
    };
  });

  app.post("/swaps", async (request) => {
    requireCreator(request);
    const body = createSwapSchema.parse(request.body);

    let code = generateSwapCode();
    for (let i = 0; i < 10; i++) {
      const existing = await prisma.swap.findUnique({ where: { code } });
      if (!existing) break;
      code = generateSwapCode();
    }

    const swap = await prisma.swap.create({
      data: {
        code,
        title: body.title,
        rulesText: body.rulesText,
        startDate: parseDate(body.startDate),
        giftDeadline: parseDate(body.giftDeadline),
        priceMin: body.priceMin,
        priceMax: body.priceMax,
        autoMatch: body.autoMatch,
        creatorUserId: request.creatorSession!.userId,
        status: "open",
      },
    });

    return {
      swap: {
        id: swap.id,
        code: swap.code,
        title: swap.title,
        status: swap.status,
        joinUrl: `${config.webOrigin}/join/${swap.code}`,
        manageUrl: `${config.webOrigin}/swap/${swap.code}/manage`,
      },
    };
  });

  app.get("/swaps/:code", async (request) => {
    const { code } = request.params as { code: string };
    const swap = await prisma.swap.findUnique({
      where: { code: code.toUpperCase() },
      select: {
        code: true,
        title: true,
        status: true,
        startDate: true,
        giftDeadline: true,
        priceMin: true,
        priceMax: true,
        rulesText: true,
        _count: { select: { participants: true } },
      },
    });
    if (!swap) {
      const err = new Error("Not found");
      (err as Error & { statusCode: number }).statusCode = 404;
      throw err;
    }
    return {
      swap: {
        ...swap,
        participantCount: swap._count.participants,
        canJoin: swap.status === "open",
      },
    };
  });

  app.get("/swaps/:code/manage", async (request) => {
    const { code } = request.params as { code: string };
    const swap = await requireSwapCreator(request, code);

    const full = await prisma.swap.findUnique({
      where: { id: swap.id },
      include: {
        participants: {
          include: {
            wishlistItems: { orderBy: { sortOrder: "asc" } },
          },
          orderBy: { joinedAt: "asc" },
        },
        blackoutPairs: true,
        assignments: true,
      },
    });

    const assignmentMap = new Map(
      (full?.assignments ?? []).map((a) => [a.giverId, a]),
    );

    return {
      swap: {
        id: full!.id,
        code: full!.code,
        title: full!.title,
        status: full!.status,
        rulesText: full!.rulesText,
        startDate: full!.startDate,
        giftDeadline: full!.giftDeadline,
        priceMin: full!.priceMin,
        priceMax: full!.priceMax,
        autoMatch: full!.autoMatch,
        joinUrl: `${config.webOrigin}/join/${full!.code}`,
      },
      participants: full!.participants.map((p) => ({
        id: p.id,
        firstName: p.firstName,
        steamUsername: p.steamUsername,
        discordTag: p.discordTag,
        hasDiscord: !!p.discordUserId,
        wishlistCount: p.wishlistItems.length,
        giftSent: assignmentMap.get(p.id)?.sentAt ?? null,
      })),
      blackouts: full!.blackoutPairs.map((b) => ({
        id: b.id,
        participantAId: b.participantAId,
        participantBId: b.participantBId,
      })),
      matchingPossible: isMatchingPossible(
        full!.participants.map((p) => ({ id: p.id })),
        full!.blackoutPairs.map((b) => [b.participantAId, b.participantBId]),
      ),
      assignments:
        full!.status === "matched" || full!.status === "completed"
          ? full!.assignments.map((a) => ({
              giverId: a.giverId,
              receiverId: a.receiverId,
              sentAt: a.sentAt,
            }))
          : null,
    };
  });

  app.patch("/swaps/:code", async (request) => {
    const { code } = request.params as { code: string };
    const swap = await requireSwapCreator(request, code);
    const body = updateSwapSchema.parse(request.body);

    const updated = await prisma.swap.update({
      where: { id: swap.id },
      data: {
        ...(body.title && { title: body.title }),
        ...(body.rulesText !== undefined && { rulesText: body.rulesText }),
        ...(body.startDate && { startDate: parseDate(body.startDate) }),
        ...(body.giftDeadline && { giftDeadline: parseDate(body.giftDeadline) }),
        ...(body.priceMin !== undefined && { priceMin: body.priceMin }),
        ...(body.priceMax !== undefined && { priceMax: body.priceMax }),
        ...(body.status && { status: body.status }),
        ...(body.autoMatch !== undefined && { autoMatch: body.autoMatch }),
      },
    });

    return { swap: updated };
  });

  app.post("/swaps/:code/join", async (request, reply) => {
    const { code } = request.params as { code: string };
    const body = joinSwapSchema.parse(request.body);

    const swap = await prisma.swap.findUnique({
      where: { code: code.toUpperCase() },
    });
    if (!swap) {
      const err = new Error("Swap not found");
      (err as Error & { statusCode: number }).statusCode = 404;
      throw err;
    }
    if (swap.status !== "open") {
      const err = new Error("This swap is not accepting signups");
      (err as Error & { statusCode: number }).statusCode = 400;
      throw err;
    }

    const existing = await prisma.swapParticipant.findFirst({
      where: { swapId: swap.id, discordUserId: body.discordUserId },
    });
    if (existing) {
      const err = new Error("You already joined this swap");
      (err as Error & { statusCode: number }).statusCode = 400;
      throw err;
    }

    const secretToken = generateSecretToken();
    const secretTokenHash = await hashToken(secretToken);
    const steamId = await resolveSteamId(body.steamUsername);

    const participant = await prisma.swapParticipant.create({
      data: {
        swapId: swap.id,
        firstName: body.firstName,
        steamUsername: body.steamUsername.trim(),
        steamId,
        discordUserId: body.discordUserId,
        discordTag: body.discordTag,
        secretTokenHash,
        wishlistItems: {
          create: body.wishlist.map((item, i) => ({
            steamAppId: item.steamAppId,
            name: item.name,
            storeUrl: item.storeUrl,
            priceHint: item.priceHint,
            sortOrder: i,
          })),
        },
      },
    });

    const jwt = await signSession({
      type: "participant",
      participantId: participant.id,
      swapId: swap.id,
    });
    reply.setCookie(COOKIE_PARTICIPANT, jwt, cookieOptions());

    const participantUrl = `${config.webOrigin}/s/${swap.code}/me/${secretToken}`;

    await sendDirectMessage(
      body.discordUserId,
      buildSignupDm({ swapTitle: swap.title, code: swap.code }),
    );

    return {
      participantId: participant.id,
      participantUrl,
      code: swap.code,
    };
  });

  app.post("/swaps/:code/session", async (request, reply) => {
    const { code } = request.params as { code: string };
    const { token } = request.body as { token?: string };
    if (!token) {
      const err = new Error("Token required");
      (err as Error & { statusCode: number }).statusCode = 400;
      throw err;
    }

    const swap = await prisma.swap.findUnique({
      where: { code: code.toUpperCase() },
    });
    if (!swap) {
      const err = new Error("Not found");
      (err as Error & { statusCode: number }).statusCode = 404;
      throw err;
    }

    const participants = await prisma.swapParticipant.findMany({
      where: { swapId: swap.id },
    });

    let matched: (typeof participants)[0] | null = null;
    for (const p of participants) {
      if (await verifyToken(token, p.secretTokenHash)) {
        matched = p;
        break;
      }
    }

    if (!matched) {
      const err = new Error("Invalid token");
      (err as Error & { statusCode: number }).statusCode = 401;
      throw err;
    }

    const jwt = await signSession({
      type: "participant",
      participantId: matched.id,
      swapId: swap.id,
    });
    reply.setCookie(COOKIE_PARTICIPANT, jwt, cookieOptions());

    return { ok: true, code: swap.code };
  });

  app.get("/swaps/:code/me", async (request) => {
    const { code } = request.params as { code: string };
    const swap = await prisma.swap.findUnique({
      where: { code: code.toUpperCase() },
    });
    if (!swap) {
      const err = new Error("Not found");
      (err as Error & { statusCode: number }).statusCode = 404;
      throw err;
    }

    const participant = await requireParticipantForSwap(request, swap.id);
    const wishlist = await prisma.wishlistItem.findMany({
      where: { participantId: participant.id },
      orderBy: { sortOrder: "asc" },
    });

    return {
      swap: {
        code: swap.code,
        title: swap.title,
        status: swap.status,
        giftDeadline: swap.giftDeadline,
        priceMin: swap.priceMin,
        priceMax: swap.priceMax,
        rulesText: swap.rulesText,
      },
      participant: {
        id: participant.id,
        firstName: participant.firstName,
        steamUsername: participant.steamUsername,
        discordTag: participant.discordTag,
        hasDiscord: !!participant.discordUserId,
      },
      wishlist,
      canEditWishlist: swap.status === "open" || swap.status === "locked",
    };
  });

  app.patch("/swaps/:code/me", async (request) => {
    const { code } = request.params as { code: string };
    const body = updateParticipantSchema.parse(request.body);
    const swap = await prisma.swap.findUnique({
      where: { code: code.toUpperCase() },
    });
    if (!swap || (swap.status !== "open" && swap.status !== "locked")) {
      const err = new Error("Cannot update profile");
      (err as Error & { statusCode: number }).statusCode = 400;
      throw err;
    }

    const participant = await requireParticipantForSwap(request, swap.id);

    const data: {
      firstName?: string;
      steamUsername?: string;
      steamId?: string | null;
      discordUserId?: string;
      discordTag?: string | null;
    } = {};

    if (body.firstName) data.firstName = body.firstName;
    if (body.discordUserId) data.discordUserId = body.discordUserId;
    if (body.discordTag !== undefined) data.discordTag = body.discordTag;

    if (body.steamUsername) {
      const trimmed = body.steamUsername.trim();
      data.steamUsername = trimmed;
      data.steamId = await resolveSteamId(trimmed);
    }

    const updated = await prisma.swapParticipant.update({
      where: { id: participant.id },
      data,
    });

    return { participant: updated };
  });

  app.put("/swaps/:code/me/wishlist", async (request) => {
    const { code } = request.params as { code: string };
    const body = wishlistUpdateSchema.parse(request.body);
    const swap = await prisma.swap.findUnique({
      where: { code: code.toUpperCase() },
    });
    if (!swap || (swap.status !== "open" && swap.status !== "locked")) {
      const err = new Error("Cannot update wishlist");
      (err as Error & { statusCode: number }).statusCode = 400;
      throw err;
    }

    const participant = await requireParticipantForSwap(request, swap.id);

    await prisma.$transaction(async (tx) => {
      await tx.wishlistItem.deleteMany({ where: { participantId: participant.id } });
      await tx.wishlistItem.createMany({
        data: body.items.map((item, i) => ({
          participantId: participant.id,
          steamAppId: item.steamAppId,
          name: item.name,
          storeUrl: item.storeUrl,
          priceHint: item.priceHint,
          sortOrder: i,
        })),
      });
    });

    const wishlist = await prisma.wishlistItem.findMany({
      where: { participantId: participant.id },
      orderBy: { sortOrder: "asc" },
    });

    return { wishlist };
  });

  app.get("/swaps/:code/my-assignment", async (request) => {
    const { code } = request.params as { code: string };
    const swap = await prisma.swap.findUnique({
      where: { code: code.toUpperCase() },
    });
    if (!swap) {
      const err = new Error("Not found");
      (err as Error & { statusCode: number }).statusCode = 404;
      throw err;
    }
    if (swap.status !== "matched" && swap.status !== "completed") {
      return { assignment: null };
    }

    const participant = await requireParticipantForSwap(request, swap.id);
    const assignment = await prisma.assignment.findUnique({
      where: { swapId_giverId: { swapId: swap.id, giverId: participant.id } },
      include: {
        receiver: { include: { wishlistItems: { orderBy: { sortOrder: "asc" } } } },
      },
    });

    if (!assignment) {
      return { assignment: null };
    }

    return {
      assignment: {
        receiver: {
          firstName: assignment.receiver.firstName,
          steamUsername: assignment.receiver.steamUsername,
          discordTag: assignment.receiver.discordTag,
        },
        wishlist: assignment.receiver.wishlistItems,
        sentAt: assignment.sentAt,
        priceMin: swap.priceMin,
        priceMax: swap.priceMax,
      },
    };
  });

  app.post("/swaps/:code/mark-sent", async (request) => {
    const { code } = request.params as { code: string };
    const swap = await prisma.swap.findUnique({
      where: { code: code.toUpperCase() },
    });
    if (!swap || swap.status !== "matched") {
      const err = new Error("Cannot mark sent");
      (err as Error & { statusCode: number }).statusCode = 400;
      throw err;
    }

    const participant = await requireParticipantForSwap(request, swap.id);
    const assignment = await prisma.assignment.update({
      where: { swapId_giverId: { swapId: swap.id, giverId: participant.id } },
      data: { sentAt: new Date() },
    });

    return { sentAt: assignment.sentAt };
  });

  app.post("/swaps/:code/blackouts", async (request) => {
    const { code } = request.params as { code: string };
    const swap = await requireSwapCreator(request, code);
    const body = blackoutSchema.parse(request.body);

    if (body.participantAId === body.participantBId) {
      const err = new Error("Cannot blackout same participant");
      (err as Error & { statusCode: number }).statusCode = 400;
      throw err;
    }

    const [aId, bId] =
      body.participantAId < body.participantBId
        ? [body.participantAId, body.participantBId]
        : [body.participantBId, body.participantAId];

    const pair = await prisma.blackoutPair.upsert({
      where: {
        swapId_participantAId_participantBId: {
          swapId: swap.id,
          participantAId: aId,
          participantBId: bId,
        },
      },
      create: { swapId: swap.id, participantAId: aId, participantBId: bId },
      update: {},
    });

    return { blackout: pair };
  });

  app.delete("/swaps/:code/blackouts/:id", async (request) => {
    const { code, id } = request.params as { code: string; id: string };
    const swap = await requireSwapCreator(request, code);

    await prisma.blackoutPair.deleteMany({
      where: { id, swapId: swap.id },
    });

    return { ok: true };
  });

  app.post("/swaps/:code/match", async (request) => {
    const { code } = request.params as { code: string };
    const swap = await requireSwapCreator(request, code);

    try {
      await runSwapMatching(swap.id, request.creatorSession!.userId);
      return { ok: true };
    } catch (e) {
      if (e instanceof MatchError) {
        const err = new Error(e.message);
        (err as Error & { statusCode: number; code: string }).statusCode = 400;
        (err as Error & { code: string }).code = e.code;
        throw err;
      }
      throw e;
    }
  });

  app.post("/swaps/:code/participants/:participantId/regenerate-token", async (request) => {
    const { code, participantId } = request.params as {
      code: string;
      participantId: string;
    };
    const swap = await requireSwapCreator(request, code);

    const secretToken = generateSecretToken();
    const secretTokenHash = await hashToken(secretToken);

    await prisma.swapParticipant.updateMany({
      where: { id: participantId, swapId: swap.id },
      data: { secretTokenHash },
    });

    return {
      participantUrl: `${config.webOrigin}/s/${swap.code}/me/${secretToken}`,
    };
  });
}
