import { getSwapFull, listParticipants, runMatchingTransaction } from "../db/swaps.js";
import { findDerangementWithBlackouts } from "../lib/matcher.js";
import { buildMatchDm, buildReminderDm, sendDirectMessage } from "./discord.js";
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
  const full = await getSwapFull(swapId);

  if (!full) throw new MatchError("Swap not found", "NOT_FOUND");
  const { swap, participants, blackoutPairs } = full;

  if (swap.status === "matched" || swap.status === "completed") {
    throw new MatchError("Swap already matched", "ALREADY_MATCHED");
  }
  if (swap.status === "cancelled") {
    throw new MatchError("Swap is cancelled", "CANCELLED");
  }

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

  const blackoutTuples: Array<[string, string]> = blackoutPairs.map((b) => [
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

  const rows: Array<{ giverId: string; receiverId: string }> = [];
  for (const [giverId, receiverId] of assignment) {
    rows.push({ giverId, receiverId });
  }

  await runMatchingTransaction(swapId, rows, actorUserId ?? null, participants.length);

  const updated = await getSwapFull(swapId);
  if (!updated) return;

  for (const a of updated.assignments) {
    const giver = updated.participants.find((p) => p.id === a.giverId);
    const receiver = updated.participants.find((p) => p.id === a.receiverId);
    if (!giver?.discordUserId || !receiver) continue;

    const myPageUrl = `${config.webOrigin}/s/${updated.swap.code}/me`;
    const content = buildMatchDm({
      swapTitle: updated.swap.title,
      gifteeFirstName: receiver.firstName,
      steamUsername: receiver.steamUsername,
      discordTag: receiver.discordTag,
      wishlist: receiver.wishlistItems.map((w) => ({
        name: w.name,
        storeUrl: w.storeUrl,
      })),
      priceMin: updated.swap.priceMin,
      priceMax: updated.swap.priceMax,
      myPageUrl,
    });

    await sendDirectMessage(giver.discordUserId, content);
  }
}

export async function runAutoMatch() {
  const { findSwapsForAutoMatch } = await import("../db/swaps.js");
  const now = new Date();
  const swaps = await findSwapsForAutoMatch(now);

  for (const swap of swaps) {
    const participants = await listParticipants(swap.id);
    if (participants.length < 3) continue;
    if (participants.some((p) => !p.discordUserId)) continue;
    try {
      await runSwapMatching(swap.id);
      console.log(`Auto-matched swap ${swap.code}`);
    } catch (e) {
      console.warn(`Auto-match failed for ${swap.code}:`, e);
    }
  }
}

export async function runGiftReminders() {
  const { findSwapsForReminders, updateAssignmentReminder } = await import("../db/swaps.js");
  const now = new Date();
  const windowEnd = new Date(now.getTime() + config.giftReminderDaysBefore * 86_400_000);
  const swaps = await findSwapsForReminders(now, windowEnd);

  for (const { swap, assignments } of swaps) {
    for (const assignment of assignments) {
      if (!assignment.giver.discordUserId) continue;

      const content = buildReminderDm({
        swapTitle: swap.title,
        giftDeadline: swap.giftDeadline.toLocaleDateString(),
        myPageUrl: `${config.webOrigin}/s/${swap.code}/me`,
      });

      const sent = await sendDirectMessage(assignment.giver.discordUserId, content);
      if (sent) {
        await updateAssignmentReminder(swap.id, assignment.id);
      }
    }
  }
}
