import type { FastifyInstance } from "fastify";
import {
  blackoutSchema,
  createSwapSchema,
  joinSwapSchema,
  updateParticipantSchema,
  updateSwapSchema,
  wishlistUpdateSchema,
} from "@steam-game-swap/shared";
import {
  findSwapByCode,
  findSwapsByCreator,
  findSwapsByDiscordParticipant,
  createSwap,
  updateSwap,
  getSwapFull,
  findParticipant,
  findParticipantByDiscord,
  createParticipant,
  DuplicateDiscordParticipantError,
  deleteParticipant,
  listParticipants,
  listWishlist,
  replaceWishlist,
  updateParticipant,
  findAssignmentByGiver,
  updateAssignmentSent,
  upsertBlackout,
  deleteBlackout,
} from "../db/swaps.js";
import { assertDevTools, config, devToolsEnabled } from "../config.js";
import { findUserById } from "../db/users.js";
import { generateSwapCode } from "../lib/codes.js";
import { setSessionCookie } from "../lib/session.js";
import { generateSecretToken, hashToken, verifyToken } from "../lib/tokens.js";
import {
  requireCreator,
  requireParticipantForSwap,
  requireSwapCreator,
} from "../plugins/auth.js";
import { resolveSteamId } from "../services/steam.js";
import {
  buildCancelDm,
  buildSignupDm,
  sendDirectMessage,
  steamProfileUrl,
} from "../services/discord.js";
import { MatchError, runSwapMatching } from "../services/swap-match.js";
import { isMatchingPossible } from "../lib/matcher.js";
import type { SwapStatus } from "../db/types.js";

function parseDate(input: string): Date {
  if (input.includes("T")) return new Date(input);
  return new Date(`${input}T12:00:00.000Z`);
}

function httpError(message: string, statusCode: number) {
  const err = new Error(message);
  (err as Error & { statusCode: number }).statusCode = statusCode;
  return err;
}

function canAddParticipants(status: string) {
  return status === "open" || status === "locked";
}

type SwapListItem = {
  id: string;
  code: string;
  title: string;
  status: string;
  startDate: Date;
  giftDeadline: Date;
  participantCount: number;
  autoMatch: boolean;
};

type MatchLink = {
  firstName: string;
  steamUsername: string;
  steamProfileUrl: string;
};

function swapListItem(swap: {
  id: string;
  code: string;
  title: string;
  status: string;
  startDate: Date;
  giftDeadline: Date;
  participantCount: number;
  autoMatch: boolean;
}): SwapListItem {
  return {
    id: swap.id,
    code: swap.code,
    title: swap.title,
    status: swap.status,
    startDate: swap.startDate,
    giftDeadline: swap.giftDeadline,
    participantCount: swap.participantCount,
    autoMatch: swap.autoMatch,
  };
}

async function viewerInSwap(
  request: { creatorSession?: { userId: string } },
  full: {
    swap: { status: string };
    participants: Array<{
      id: string;
      discordUserId: string | null;
      firstName: string;
      steamUsername: string;
      steamId: string | null;
    }>;
    assignments: Array<{ giverId: string; receiverId: string }>;
  },
): Promise<{ participantId: string | null; match: MatchLink | null }> {
  const user = request.creatorSession
    ? await findUserById(request.creatorSession.userId)
    : null;
  const me = user?.discordId
    ? full.participants.find((p) => p.discordUserId === user.discordId) ?? null
    : null;
  if (!me) return { participantId: null, match: null };

  const matched = full.swap.status === "matched" || full.swap.status === "completed";
  if (!matched) return { participantId: me.id, match: null };

  const assignment = full.assignments.find((a) => a.giverId === me.id);
  const receiver = assignment
    ? full.participants.find((p) => p.id === assignment.receiverId)
    : null;
  return {
    participantId: me.id,
    match: receiver
      ? {
          firstName: receiver.firstName,
          steamUsername: receiver.steamUsername,
          steamProfileUrl: steamProfileUrl(receiver.steamId, receiver.steamUsername),
        }
      : null,
  };
}

async function matchLinkFor(
  swapId: string,
  status: string,
  participantId: string,
): Promise<MatchLink | null> {
  if (status !== "matched" && status !== "completed") return null;
  const assignment = await findAssignmentByGiver(swapId, participantId);
  if (!assignment) return null;
  const receiver = await findParticipant(swapId, assignment.receiverId);
  if (!receiver) return null;
  return {
    firstName: receiver.firstName,
    steamUsername: receiver.steamUsername,
    steamProfileUrl: steamProfileUrl(receiver.steamId, receiver.steamUsername),
  };
}

export async function swapRoutes(app: FastifyInstance) {
  app.get("/swaps/mine", async (request) => {
    requireCreator(request);
    const userId = request.creatorSession!.userId;
    const user = await findUserById(userId);
    const createdSwaps = await findSwapsByCreator(userId);

    const joined: Array<SwapListItem & { match: MatchLink | null }> = [];
    const seenJoined = new Set<string>();

    async function addJoined(
      swap: SwapListItem & { id: string },
      participantId: string,
    ) {
      if (seenJoined.has(swap.id)) return;
      seenJoined.add(swap.id);
      joined.push({
        ...swapListItem(swap),
        match: await matchLinkFor(swap.id, swap.status, participantId),
      });
    }

    if (user?.discordId) {
      for (const swap of createdSwaps) {
        const participant = await findParticipantByDiscord(swap.id, user.discordId);
        if (participant) await addJoined(swap, participant.id);
      }
      try {
        const others = await findSwapsByDiscordParticipant(user.discordId);
        for (const swap of others) await addJoined(swap, swap.participantId);
      } catch (err) {
        request.log.error({ err }, "failed to load joined swaps");
      }
    }

    joined.sort(
      (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
    );

    return {
      created: createdSwaps.map(swapListItem),
      joined,
    };
  });

  app.post("/swaps", async (request) => {
    requireCreator(request);
    const body = createSwapSchema.parse(request.body);

    let code = generateSwapCode();
    for (let i = 0; i < 10; i++) {
      const existing = await findSwapByCode(code);
      if (!existing) break;
      code = generateSwapCode();
    }

    const swap = await createSwap({
      code,
      title: body.title,
      rulesText: body.rulesText ?? null,
      startDate: parseDate(body.startDate),
      giftDeadline: parseDate(body.giftDeadline),
      priceMin: body.priceMin ?? null,
      priceMax: body.priceMax ?? null,
      autoMatch: body.autoMatch,
      discordInviteUrl: body.discordInviteUrl ?? null,
      timeZone: body.timeZone ?? null,
      creatorUserId: request.creatorSession!.userId,
      status: "open",
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

  app.post("/swaps/:code/dev/participants", async (request) => {
    assertDevTools();
    const { code } = request.params as { code: string };
    const swap = await requireSwapCreator(request, code);
    if (!canAddParticipants(swap.status)) {
      throw httpError("This swap is no longer taking people", 400);
    }

    const body = request.body as { firstName?: string; steamUsername?: string };
    const firstName = body.firstName?.trim() ?? "";
    if (!firstName || firstName.length > 80) {
      throw httpError("Name is required", 400);
    }
    const steamUsername = (body.steamUsername?.trim() || firstName).slice(0, 80);

    const participant = await createParticipant(
      swap.id,
      {
        firstName,
        steamUsername,
        steamId: null,
        discordUserId: `dev:${crypto.randomUUID()}`,
        discordTag: "Test participant",
        secretTokenHash: await hashToken(generateSecretToken()),
      },
      [],
    );

    return {
      participant: {
        id: participant.id,
        firstName: participant.firstName,
        steamUsername: participant.steamUsername,
      },
    };
  });

  app.post("/swaps/:code/dev/join-as-me", async (request, reply) => {
    assertDevTools();
    const { code } = request.params as { code: string };
    const swap = await requireSwapCreator(request, code);
    const user = await findUserById(request.creatorSession!.userId);
    if (!user) throw httpError("Unauthorized", 401);

    const existing = await findParticipantByDiscord(swap.id, user.discordId);
    const participant = existing ?? await (async () => {
      if (!canAddParticipants(swap.status)) {
        throw httpError("This swap is no longer taking people", 400);
      }
      try {
        return await createParticipant(
          swap.id,
          {
            firstName: (user.displayName || user.discordTag || "Me").slice(0, 80),
            steamUsername: (user.discordTag || user.displayName || "me").slice(0, 80),
            steamId: null,
            discordUserId: user.discordId,
            discordTag: user.discordTag,
            secretTokenHash: await hashToken(generateSecretToken()),
          },
          [],
        );
      } catch (err) {
        if (err instanceof DuplicateDiscordParticipantError) {
          return findParticipantByDiscord(swap.id, user.discordId);
        }
        throw err;
      }
    })();

    if (!participant) throw httpError("Could not join as yourself", 500);

    await setSessionCookie(request, reply, {
      type: "participant",
      participantId: participant.id,
      swapId: swap.id,
    });

    return { participantId: participant.id, code: swap.code };
  });

  app.post("/swaps/:code/dev/act-as/:participantId", async (request, reply) => {
    assertDevTools();
    const { code, participantId } = request.params as { code: string; participantId: string };
    const swap = await requireSwapCreator(request, code);
    const participant = await findParticipant(swap.id, participantId);
    if (!participant) throw httpError("Participant not found", 404);

    await setSessionCookie(request, reply, {
      type: "participant",
      participantId: participant.id,
      swapId: swap.id,
    });

    return { ok: true, code: swap.code, firstName: participant.firstName };
  });

  app.get("/swaps/:code", async (request) => {
    const { code } = request.params as { code: string };
    const swap = await findSwapByCode(code);
    if (!swap) {
      const err = new Error("Not found");
      (err as Error & { statusCode: number }).statusCode = 404;
      throw err;
    }
    const participants = await listParticipants(swap.id);
    return {
      swap: {
        code: swap.code,
        title: swap.title,
        status: swap.status,
        startDate: swap.startDate,
        giftDeadline: swap.giftDeadline,
        priceMin: swap.priceMin,
        priceMax: swap.priceMax,
        rulesText: swap.rulesText,
        discordInviteUrl: swap.discordInviteUrl,
        participantCount: participants.length,
        canJoin: swap.status === "open",
      },
    };
  });

  app.get("/swaps/:code/manage", async (request) => {
    const { code } = request.params as { code: string };
    const swap = await requireSwapCreator(request, code);
    const full = await getSwapFull(swap.id);
    if (!full) {
      const err = new Error("Not found");
      (err as Error & { statusCode: number }).statusCode = 404;
      throw err;
    }

    const assignmentMap = new Map(
      full.assignments.map((a) => [a.giverId, a]),
    );

    return {
      swap: {
        id: full.swap.id,
        code: full.swap.code,
        title: full.swap.title,
        status: full.swap.status,
        rulesText: full.swap.rulesText,
        startDate: full.swap.startDate,
        giftDeadline: full.swap.giftDeadline,
        priceMin: full.swap.priceMin,
        priceMax: full.swap.priceMax,
        autoMatch: full.swap.autoMatch,
        discordInviteUrl: full.swap.discordInviteUrl,
        timeZone: full.swap.timeZone,
        joinUrl: `${config.webOrigin}/join/${full.swap.code}`,
      },
      participants: full.participants.map((p) => ({
        id: p.id,
        firstName: p.firstName,
        steamUsername: p.steamUsername,
        steamProfileUrl: steamProfileUrl(p.steamId, p.steamUsername),
        discordTag: p.discordTag,
        hasDiscord: !!p.discordUserId,
        wishlistCount: p.wishlistItems.length,
        giftSent: assignmentMap.get(p.id)?.sentAt ?? null,
      })),
      blackouts: full.blackoutPairs.map((b) => ({
        id: b.id,
        participantAId: b.participantAId,
        participantBId: b.participantBId,
      })),
      matchingPossible: isMatchingPossible(
        full.participants.map((p) => ({ id: p.id })),
        full.blackoutPairs.map((b) => [b.participantAId, b.participantBId]),
      ),
      assignments:
        full.swap.status === "matched" || full.swap.status === "completed"
          ? full.assignments.map((a) => ({
              giverId: a.giverId,
              receiverId: a.receiverId,
              sentAt: a.sentAt,
            }))
          : null,
      viewer: await viewerInSwap(request, full),
    };
  });

  app.patch("/swaps/:code", async (request) => {
    const { code } = request.params as { code: string };
    const swap = await requireSwapCreator(request, code);
    const body = updateSwapSchema.parse(request.body);

    if (body.status === "cancelled" && swap.status === "cancelled") {
      return { swap };
    }

    const updated = await updateSwap(swap.id, {
      ...(body.title && { title: body.title }),
      ...(body.rulesText !== undefined && { rulesText: body.rulesText }),
      ...(body.startDate && { startDate: parseDate(body.startDate) }),
      ...(body.giftDeadline && { giftDeadline: parseDate(body.giftDeadline) }),
      ...(body.priceMin !== undefined && { priceMin: body.priceMin }),
      ...(body.priceMax !== undefined && { priceMax: body.priceMax }),
      ...(body.status && { status: body.status as SwapStatus }),
      ...(body.autoMatch !== undefined && { autoMatch: body.autoMatch }),
      ...(body.discordInviteUrl !== undefined && { discordInviteUrl: body.discordInviteUrl }),
      ...(body.timeZone !== undefined && { timeZone: body.timeZone }),
    });

    if (body.status === "cancelled" && swap.status !== "cancelled") {
      const participants = await listParticipants(updated.id);
      const cancelDm = buildCancelDm({ swapTitle: updated.title, code: updated.code });
      for (const p of participants) {
        if (!p.discordUserId) continue;
        await sendDirectMessage(p.discordUserId, cancelDm);
      }
    }

    return { swap: updated };
  });

  app.post("/swaps/:code/join", async (request, reply) => {
    const { code } = request.params as { code: string };
    let raw = request.body as Record<string, unknown> | null;
    if (!raw || typeof raw !== "object") {
      raw = {};
    }

    // Production: Discord identity comes from the signed-in session only.
    // Dev tools: allow a body id (tests) or auto-inject a fake one.
    const sessionUser = request.creatorSession
      ? await findUserById(request.creatorSession.userId)
      : null;

    if (sessionUser) {
      raw = {
        ...raw,
        discordUserId: sessionUser.discordId,
        discordTag: sessionUser.discordTag ?? sessionUser.displayName ?? undefined,
      };
    } else if (devToolsEnabled()) {
      if (!raw.discordUserId) {
        raw = {
          ...raw,
          discordUserId: `dev:${crypto.randomUUID()}`,
          discordTag: typeof raw.discordTag === "string" && raw.discordTag
            ? raw.discordTag
            : "Test participant",
        };
      }
    } else {
      throw httpError("Sign in with Discord to join this swap", 401);
    }

    const body = joinSwapSchema.parse(raw);

    const swap = await findSwapByCode(code);
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

    const secretToken = generateSecretToken();
    const secretTokenHash = await hashToken(secretToken);
    const steamId = await resolveSteamId(body.steamUsername);

    const participant = await createParticipant(
      swap.id,
      {
        firstName: body.firstName,
        steamUsername: body.steamUsername.trim(),
        steamId,
        discordUserId: body.discordUserId,
        discordTag: body.discordTag ?? null,
        secretTokenHash,
      },
      body.wishlist.map((item, i) => ({
        steamAppId: item.steamAppId,
        name: item.name,
        storeUrl: item.storeUrl,
        priceHint: item.priceHint ?? null,
        sortOrder: i,
      })),
    );

    await setSessionCookie(request, reply, {
      type: "participant",
      participantId: participant.id,
      swapId: swap.id,
    });

    const participantUrl = `${config.webOrigin}/s/${swap.code}/me/${secretToken}`;

    if (!body.discordUserId.startsWith("dev:")) {
      await sendDirectMessage(
        body.discordUserId,
        buildSignupDm({
          swapTitle: swap.title,
          code: swap.code,
        }),
      );
    }

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

    const swap = await findSwapByCode(code);
    if (!swap) {
      const err = new Error("Not found");
      (err as Error & { statusCode: number }).statusCode = 404;
      throw err;
    }

    const participants = await listParticipants(swap.id);
    let matched = null;
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

    await setSessionCookie(request, reply, {
      type: "participant",
      participantId: matched.id,
      swapId: swap.id,
    });

    return { ok: true, code: swap.code };
  });

  app.get("/swaps/:code/me", async (request, reply) => {
    const { code } = request.params as { code: string };
    const swap = await findSwapByCode(code);
    if (!swap) {
      const err = new Error("Not found");
      (err as Error & { statusCode: number }).statusCode = 404;
      throw err;
    }

    const participant = await requireParticipantForSwap(request, swap.id, reply);
    const wishlist = await listWishlist(swap.id, participant.id);

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

  app.patch("/swaps/:code/me", async (request, reply) => {
    const { code } = request.params as { code: string };
    const body = updateParticipantSchema.parse(request.body);
    const swap = await findSwapByCode(code);
    if (!swap || (swap.status !== "open" && swap.status !== "locked")) {
      const err = new Error("Cannot update profile");
      (err as Error & { statusCode: number }).statusCode = 400;
      throw err;
    }

    const participant = await requireParticipantForSwap(request, swap.id, reply);
    const patch: Parameters<typeof updateParticipant>[2] = {};

    if (body.firstName) patch.firstName = body.firstName;
    if (body.discordUserId) patch.discordUserId = body.discordUserId;
    if (body.discordTag !== undefined) patch.discordTag = body.discordTag;

    if (body.steamUsername) {
      const trimmed = body.steamUsername.trim();
      patch.steamUsername = trimmed;
      patch.steamId = await resolveSteamId(trimmed);
    }

    const updated = await updateParticipant(swap.id, participant.id, patch);
    return { participant: updated };
  });

  app.put("/swaps/:code/me/wishlist", async (request, reply) => {
    const { code } = request.params as { code: string };
    const body = wishlistUpdateSchema.parse(request.body);
    const swap = await findSwapByCode(code);
    if (!swap || (swap.status !== "open" && swap.status !== "locked")) {
      const err = new Error("Cannot update wishlist");
      (err as Error & { statusCode: number }).statusCode = 400;
      throw err;
    }

    const participant = await requireParticipantForSwap(request, swap.id, reply);
    const wishlist = await replaceWishlist(
      swap.id,
      participant.id,
      body.items.map((item, i) => ({
        steamAppId: item.steamAppId,
        name: item.name,
        storeUrl: item.storeUrl,
        priceHint: item.priceHint ?? null,
        sortOrder: i,
      })),
    );

    return { wishlist };
  });

  app.get("/swaps/:code/my-assignment", async (request, reply) => {
    const { code } = request.params as { code: string };
    const swap = await findSwapByCode(code);
    if (!swap) {
      const err = new Error("Not found");
      (err as Error & { statusCode: number }).statusCode = 404;
      throw err;
    }
    if (swap.status !== "matched" && swap.status !== "completed") {
      return { assignment: null };
    }

    const participant = await requireParticipantForSwap(request, swap.id, reply);
    const assignment = await findAssignmentByGiver(swap.id, participant.id);

    if (!assignment) {
      return { assignment: null };
    }

    const receiver = await findParticipant(swap.id, assignment.receiverId);
    if (!receiver) return { assignment: null };

    const receiverWishlist = await listWishlist(swap.id, receiver.id);

    return {
      assignment: {
        receiver: {
          firstName: receiver.firstName,
          steamUsername: receiver.steamUsername,
          steamId: receiver.steamId,
          steamProfileUrl: steamProfileUrl(receiver.steamId, receiver.steamUsername),
          discordTag: receiver.discordTag,
        },
        wishlist: receiverWishlist,
        sentAt: assignment.sentAt,
        priceMin: swap.priceMin,
        priceMax: swap.priceMax,
      },
    };
  });

  app.post("/swaps/:code/mark-sent", async (request, reply) => {
    const { code } = request.params as { code: string };
    const swap = await findSwapByCode(code);
    if (!swap || swap.status !== "matched") {
      const err = new Error("Cannot mark sent");
      (err as Error & { statusCode: number }).statusCode = 400;
      throw err;
    }

    const participant = await requireParticipantForSwap(request, swap.id, reply);
    const assignment = await updateAssignmentSent(swap.id, participant.id, new Date());
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

    const pair = await upsertBlackout(swap.id, body.participantAId, body.participantBId);
    return { blackout: pair };
  });

  app.delete("/swaps/:code/blackouts/:id", async (request) => {
    const { code, id } = request.params as { code: string; id: string };
    const swap = await requireSwapCreator(request, code);
    await deleteBlackout(swap.id, id);
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

  app.delete("/swaps/:code/participants/:participantId", async (request) => {
    const { code, participantId } = request.params as {
      code: string;
      participantId: string;
    };
    const swap = await requireSwapCreator(request, code);

    if (swap.status !== "open" && swap.status !== "locked") {
      const err = new Error("Can only remove participants before matching");
      (err as Error & { statusCode: number }).statusCode = 400;
      throw err;
    }

    await deleteParticipant(swap.id, participantId);
    return { ok: true };
  });

  app.post("/swaps/:code/participants/:participantId/regenerate-token", async (request) => {
    const { code, participantId } = request.params as {
      code: string;
      participantId: string;
    };
    const swap = await requireSwapCreator(request, code);

    const secretToken = generateSecretToken();
    const secretTokenHash = await hashToken(secretToken);

    await updateParticipant(swap.id, participantId, { secretTokenHash });

    return {
      participantUrl: `${config.webOrigin}/s/${swap.code}/me/${secretToken}`,
    };
  });
}
