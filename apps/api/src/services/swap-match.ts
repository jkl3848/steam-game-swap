import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { findDerangementWithBlackouts } from "../lib/matcher.js";
import { buildMatchDm, sendDirectMessage } from "./discord.js";
import { config } from "../config.js";

export class MatchError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
  }
}

export async function runSwapMatching(swapId: string, actorUserId?: string) {
  const swap = await prisma.swap.findUnique({
    where: { id: swapId },
    include: {
      participants: { include: { wishlistItems: true } },
      blackoutPairs: true,
    },
  });

  if (!swap) throw new MatchError("Swap not found", "NOT_FOUND");
  if (swap.status === "matched" || swap.status === "completed") {
    throw new MatchError("Swap already matched", "ALREADY_MATCHED");
  }
  if (swap.status === "cancelled") {
    throw new MatchError("Swap is cancelled", "CANCELLED");
  }

  const participants = swap.participants;
  if (participants.length < 3) {
    throw new MatchError("Need at least 3 participants", "NOT_ENOUGH");
  }

  const missingDiscord = participants.filter((p) => !p.discordUserId);
  if (missingDiscord.length > 0) {
    throw new MatchError(
      `${missingDiscord.length} participant(s) missing Discord connection`,
      "MISSING_DISCORD",
    );
  }

  const blackoutTuples: Array<[string, string]> = swap.blackoutPairs.map((b) => [
    b.participantAId,
    b.participantBId,
  ]);

  const assignment = findDerangementWithBlackouts(
    participants.map((p) => ({ id: p.id })),
    blackoutTuples,
  );

  if (!assignment) {
    throw new MatchError(
      "Could not find valid matches. Add more people or remove blackouts.",
      "UNSOLVABLE",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.assignment.deleteMany({ where: { swapId } });

    const rows: Prisma.AssignmentCreateManyInput[] = [];
    for (const [giverId, receiverId] of assignment) {
      rows.push({ swapId, giverId, receiverId });
    }
    await tx.assignment.createMany({ data: rows });
    await tx.swap.update({
      where: { id: swapId },
      data: { status: "matched" },
    });
    await tx.auditLog.create({
      data: {
        swapId,
        action: "match_run",
        actorId: actorUserId ?? null,
        metadata: { participantCount: participants.length },
      },
    });
  });

  const updated = await prisma.swap.findUnique({
    where: { id: swapId },
    include: {
      participants: { include: { wishlistItems: true } },
      assignments: true,
    },
  });

  if (!updated) return;

  for (const a of updated.assignments) {
    const giver = updated.participants.find((p) => p.id === a.giverId);
    const receiver = updated.participants.find((p) => p.id === a.receiverId);
    if (!giver?.discordUserId || !receiver) continue;

    const myPageUrl = `${config.webOrigin}/s/${updated.code}/me`;
    const content = buildMatchDm({
      swapTitle: updated.title,
      gifteeFirstName: receiver.firstName,
      steamUsername: receiver.steamUsername,
      discordTag: receiver.discordTag,
      wishlist: receiver.wishlistItems.map((w) => ({
        name: w.name,
        storeUrl: w.storeUrl,
      })),
      priceMin: updated.priceMin,
      priceMax: updated.priceMax,
      myPageUrl,
    });

    await sendDirectMessage(giver.discordUserId, content);
  }
}
