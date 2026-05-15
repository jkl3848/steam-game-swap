import { getDb, newId, toDate, toTimestamp } from "./firestore.js";
import type {
  Assignment,
  BlackoutPair,
  Participant,
  Swap,
  SwapStatus,
  WishlistItem,
} from "./types.js";

function docToSwap(id: string, data: FirebaseFirestore.DocumentData): Swap {
  return {
    id,
    code: data.code as string,
    title: data.title as string,
    rulesText: (data.rulesText as string) ?? null,
    startDate: toDate(data.startDate),
    giftDeadline: toDate(data.giftDeadline),
    priceMin: (data.priceMin as number) ?? null,
    priceMax: (data.priceMax as number) ?? null,
    status: data.status as SwapStatus,
    autoMatch: data.autoMatch as boolean,
    creatorUserId: data.creatorUserId as string,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

function docToParticipant(id: string, swapId: string, data: FirebaseFirestore.DocumentData): Participant {
  return {
    id,
    swapId,
    firstName: data.firstName as string,
    steamUsername: data.steamUsername as string,
    steamId: (data.steamId as string) ?? null,
    discordUserId: (data.discordUserId as string) ?? null,
    discordTag: (data.discordTag as string) ?? null,
    secretTokenHash: data.secretTokenHash as string,
    joinedAt: toDate(data.joinedAt),
    updatedAt: toDate(data.updatedAt),
  };
}

function docToWishlist(id: string, participantId: string, data: FirebaseFirestore.DocumentData): WishlistItem {
  return {
    id,
    participantId,
    steamAppId: data.steamAppId as number,
    name: data.name as string,
    storeUrl: data.storeUrl as string,
    priceHint: (data.priceHint as string) ?? null,
    sortOrder: data.sortOrder as number,
    createdAt: toDate(data.createdAt),
  };
}

function docToBlackout(id: string, swapId: string, data: FirebaseFirestore.DocumentData): BlackoutPair {
  return {
    id,
    swapId,
    participantAId: data.participantAId as string,
    participantBId: data.participantBId as string,
    createdAt: toDate(data.createdAt),
  };
}

function docToAssignment(id: string, swapId: string, data: FirebaseFirestore.DocumentData): Assignment {
  return {
    id,
    swapId,
    giverId: data.giverId as string,
    receiverId: data.receiverId as string,
    sentAt: data.sentAt ? toDate(data.sentAt) : null,
    reminderSentAt: data.reminderSentAt ? toDate(data.reminderSentAt) : null,
    createdAt: toDate(data.createdAt),
  };
}

export async function findSwapByCode(code: string): Promise<Swap | null> {
  const q = await getDb().collection("swaps").where("code", "==", code.toUpperCase()).limit(1).get();
  if (q.empty) return null;
  const doc = q.docs[0]!;
  return docToSwap(doc.id, doc.data());
}

export async function findSwapById(id: string): Promise<Swap | null> {
  const snap = await getDb().collection("swaps").doc(id).get();
  if (!snap.exists) return null;
  return docToSwap(snap.id, snap.data()!);
}

export async function findSwapsByCreator(creatorUserId: string): Promise<Array<Swap & { participantCount: number }>> {
  const q = await getDb()
    .collection("swaps")
    .where("creatorUserId", "==", creatorUserId)
    .orderBy("createdAt", "desc")
    .get();

  const results: Array<Swap & { participantCount: number }> = [];
  for (const doc of q.docs) {
    const swap = docToSwap(doc.id, doc.data());
    const participants = await listParticipants(swap.id);
    results.push({ ...swap, participantCount: participants.length });
  }
  return results;
}

export async function createSwap(data: Omit<Swap, "id" | "createdAt" | "updatedAt">): Promise<Swap> {
  const id = newId();
  const now = new Date();
  const swap: Swap = { ...data, id, createdAt: now, updatedAt: now };
  await getDb().collection("swaps").doc(id).set({
    code: swap.code,
    title: swap.title,
    rulesText: swap.rulesText,
    startDate: toTimestamp(swap.startDate),
    giftDeadline: toTimestamp(swap.giftDeadline),
    priceMin: swap.priceMin,
    priceMax: swap.priceMax,
    status: swap.status,
    autoMatch: swap.autoMatch,
    creatorUserId: swap.creatorUserId,
    createdAt: toTimestamp(now),
    updatedAt: toTimestamp(now),
  });
  return swap;
}

export async function updateSwap(id: string, patch: Partial<Swap>): Promise<Swap> {
  const ref = getDb().collection("swaps").doc(id);
  const update: Record<string, unknown> = { updatedAt: toTimestamp(new Date()) };
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.rulesText !== undefined) update.rulesText = patch.rulesText;
  if (patch.startDate !== undefined) update.startDate = toTimestamp(patch.startDate);
  if (patch.giftDeadline !== undefined) update.giftDeadline = toTimestamp(patch.giftDeadline);
  if (patch.priceMin !== undefined) update.priceMin = patch.priceMin;
  if (patch.priceMax !== undefined) update.priceMax = patch.priceMax;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.autoMatch !== undefined) update.autoMatch = patch.autoMatch;
  await ref.update(update);
  const updated = await findSwapById(id);
  return updated!;
}

export async function listParticipants(swapId: string): Promise<Participant[]> {
  const q = await getDb()
    .collection("swaps")
    .doc(swapId)
    .collection("participants")
    .orderBy("joinedAt", "asc")
    .get();
  return q.docs.map((d) => docToParticipant(d.id, swapId, d.data()));
}

export async function findParticipant(swapId: string, participantId: string): Promise<Participant | null> {
  const snap = await getDb().collection("swaps").doc(swapId).collection("participants").doc(participantId).get();
  if (!snap.exists) return null;
  return docToParticipant(snap.id, swapId, snap.data()!);
}

export async function findParticipantByDiscord(swapId: string, discordUserId: string): Promise<Participant | null> {
  const q = await getDb()
    .collection("swaps")
    .doc(swapId)
    .collection("participants")
    .where("discordUserId", "==", discordUserId)
    .limit(1)
    .get();
  if (q.empty) return null;
  const doc = q.docs[0]!;
  return docToParticipant(doc.id, swapId, doc.data());
}

export class DuplicateDiscordParticipantError extends Error {
  readonly statusCode = 400;

  constructor() {
    super("You already joined this swap");
  }
}

export async function createParticipant(
  swapId: string,
  data: Omit<Participant, "id" | "swapId" | "joinedAt" | "updatedAt">,
  wishlist: Array<Omit<WishlistItem, "id" | "participantId" | "createdAt">>,
): Promise<Participant> {
  const db = getDb();
  const participantsCol = db.collection("swaps").doc(swapId).collection("participants");

  return db.runTransaction(async (tx) => {
    if (data.discordUserId) {
      const dupQuery = participantsCol
        .where("discordUserId", "==", data.discordUserId)
        .limit(1);
      const dupSnap = await tx.get(dupQuery);
      if (!dupSnap.empty) {
        throw new DuplicateDiscordParticipantError();
      }
    }

    const id = newId();
    const now = new Date();
    const pRef = participantsCol.doc(id);

    tx.set(pRef, {
      firstName: data.firstName,
      steamUsername: data.steamUsername,
      steamId: data.steamId,
      discordUserId: data.discordUserId,
      discordTag: data.discordTag,
      secretTokenHash: data.secretTokenHash,
      swapId,
      joinedAt: toTimestamp(now),
      updatedAt: toTimestamp(now),
    });

    wishlist.forEach((item, i) => {
      const wId = newId();
      tx.set(pRef.collection("wishlist").doc(wId), {
        steamAppId: item.steamAppId,
        name: item.name,
        storeUrl: item.storeUrl,
        priceHint: item.priceHint,
        sortOrder: i,
        createdAt: toTimestamp(now),
      });
    });

    return docToParticipant(id, swapId, {
      ...data,
      joinedAt: now,
      updatedAt: now,
    });
  });
}

export async function updateParticipant(
  swapId: string,
  participantId: string,
  patch: Partial<Participant>,
): Promise<Participant> {
  const ref = getDb().collection("swaps").doc(swapId).collection("participants").doc(participantId);
  const update: Record<string, unknown> = { updatedAt: toTimestamp(new Date()) };
  if (patch.firstName !== undefined) update.firstName = patch.firstName;
  if (patch.steamUsername !== undefined) update.steamUsername = patch.steamUsername;
  if (patch.steamId !== undefined) update.steamId = patch.steamId;
  if (patch.discordUserId !== undefined) update.discordUserId = patch.discordUserId;
  if (patch.discordTag !== undefined) update.discordTag = patch.discordTag;
  if (patch.secretTokenHash !== undefined) update.secretTokenHash = patch.secretTokenHash;
  await ref.update(update);
  return (await findParticipant(swapId, participantId))!;
}

export async function listWishlist(swapId: string, participantId: string): Promise<WishlistItem[]> {
  const q = await getDb()
    .collection("swaps")
    .doc(swapId)
    .collection("participants")
    .doc(participantId)
    .collection("wishlist")
    .orderBy("sortOrder", "asc")
    .get();
  return q.docs.map((d) => docToWishlist(d.id, participantId, d.data()));
}

export async function replaceWishlist(
  swapId: string,
  participantId: string,
  items: Array<Omit<WishlistItem, "id" | "participantId" | "createdAt">>,
): Promise<WishlistItem[]> {
  const pRef = getDb().collection("swaps").doc(swapId).collection("participants").doc(participantId);
  const existing = await pRef.collection("wishlist").get();
  const batch = getDb().batch();
  existing.docs.forEach((d) => batch.delete(d.ref));
  const now = new Date();
  items.forEach((item, i) => {
    batch.set(pRef.collection("wishlist").doc(newId()), {
      steamAppId: item.steamAppId,
      name: item.name,
      storeUrl: item.storeUrl,
      priceHint: item.priceHint,
      sortOrder: i,
      createdAt: toTimestamp(now),
    });
  });
  await batch.commit();
  return listWishlist(swapId, participantId);
}

export async function listBlackouts(swapId: string): Promise<BlackoutPair[]> {
  const q = await getDb().collection("swaps").doc(swapId).collection("blackouts").get();
  return q.docs.map((d) => docToBlackout(d.id, swapId, d.data()));
}

export async function upsertBlackout(
  swapId: string,
  participantAId: string,
  participantBId: string,
): Promise<BlackoutPair> {
  const [aId, bId] =
    participantAId < participantBId
      ? [participantAId, participantBId]
      : [participantBId, participantAId];

  const q = await getDb()
    .collection("swaps")
    .doc(swapId)
    .collection("blackouts")
    .where("participantAId", "==", aId)
    .where("participantBId", "==", bId)
    .limit(1)
    .get();

  if (!q.empty) {
    const doc = q.docs[0]!;
    return docToBlackout(doc.id, swapId, doc.data());
  }

  const id = newId();
  const now = new Date();
  await getDb().collection("swaps").doc(swapId).collection("blackouts").doc(id).set({
    participantAId: aId,
    participantBId: bId,
    createdAt: toTimestamp(now),
  });
  return { id, swapId, participantAId: aId, participantBId: bId, createdAt: now };
}

export async function deleteBlackout(swapId: string, blackoutId: string): Promise<void> {
  await getDb().collection("swaps").doc(swapId).collection("blackouts").doc(blackoutId).delete();
}

export async function listAssignments(swapId: string): Promise<Assignment[]> {
  const q = await getDb().collection("swaps").doc(swapId).collection("assignments").get();
  return q.docs.map((d) => docToAssignment(d.id, swapId, d.data()));
}

export async function findAssignmentByGiver(swapId: string, giverId: string): Promise<Assignment | null> {
  const q = await getDb()
    .collection("swaps")
    .doc(swapId)
    .collection("assignments")
    .where("giverId", "==", giverId)
    .limit(1)
    .get();
  if (q.empty) return null;
  const doc = q.docs[0]!;
  return docToAssignment(doc.id, swapId, doc.data());
}

export async function getSwapFull(swapId: string): Promise<{
  swap: Swap;
  participants: Array<Participant & { wishlistItems: WishlistItem[] }>;
  blackoutPairs: BlackoutPair[];
  assignments: Assignment[];
} | null> {
  const swap = await findSwapById(swapId);
  if (!swap) return null;

  const participants = await listParticipants(swapId);
  const withWishlist = await Promise.all(
    participants.map(async (p) => ({
      ...p,
      wishlistItems: await listWishlist(swapId, p.id),
    })),
  );

  return {
    swap,
    participants: withWishlist,
    blackoutPairs: await listBlackouts(swapId),
    assignments: await listAssignments(swapId),
  };
}

export async function runMatchingTransaction(
  swapId: string,
  rows: Array<{ giverId: string; receiverId: string }>,
  actorUserId: string | null,
  participantCount: number,
): Promise<void> {
  const db = getDb();
  await db.runTransaction(async (tx) => {
    const swapRef = db.collection("swaps").doc(swapId);
    const assignmentsSnap = await tx.get(swapRef.collection("assignments"));
    assignmentsSnap.docs.forEach((d) => tx.delete(d.ref));

    const now = toTimestamp(new Date());
    for (const row of rows) {
      const aRef = swapRef.collection("assignments").doc(newId());
      tx.set(aRef, {
        giverId: row.giverId,
        receiverId: row.receiverId,
        sentAt: null,
        reminderSentAt: null,
        createdAt: now,
      });
    }

    tx.update(swapRef, { status: "matched", updatedAt: now });

    tx.set(db.collection("auditLogs").doc(newId()), {
      swapId,
      action: "match_run",
      actorId: actorUserId,
      metadata: { participantCount },
      createdAt: now,
    });
  });
}

export async function updateAssignmentSent(swapId: string, giverId: string, sentAt: Date): Promise<Assignment> {
  const q = await getDb()
    .collection("swaps")
    .doc(swapId)
    .collection("assignments")
    .where("giverId", "==", giverId)
    .limit(1)
    .get();
  if (q.empty) throw new Error("Assignment not found");
  const doc = q.docs[0]!;
  await doc.ref.update({ sentAt: toTimestamp(sentAt) });
  const fresh = await doc.ref.get();
  if (!fresh.exists) throw new Error("Assignment not found");
  return docToAssignment(fresh.id, swapId, fresh.data()!);
}

export async function updateAssignmentReminder(swapId: string, assignmentId: string): Promise<void> {
  await getDb()
    .collection("swaps")
    .doc(swapId)
    .collection("assignments")
    .doc(assignmentId)
    .update({ reminderSentAt: toTimestamp(new Date()) });
}

export async function findSwapsForAutoMatch(now: Date): Promise<Swap[]> {
  const q = await getDb()
    .collection("swaps")
    .where("status", "==", "open")
    .where("autoMatch", "==", true)
    .where("startDate", "<=", toTimestamp(now))
    .get();
  return q.docs.map((d) => docToSwap(d.id, d.data()));
}

export async function findSwapsForReminders(now: Date, windowEnd: Date): Promise<
  Array<{
    swap: Swap;
    assignments: Array<Assignment & { giver: Participant }>;
  }>
> {
  const q = await getDb()
    .collection("swaps")
    .where("status", "==", "matched")
    .where("giftDeadline", ">", toTimestamp(now))
    .where("giftDeadline", "<=", toTimestamp(windowEnd))
    .get();

  const results: Array<{
    swap: Swap;
    assignments: Array<Assignment & { giver: Participant }>;
  }> = [];

  for (const doc of q.docs) {
    const swap = docToSwap(doc.id, doc.data());
    const assignments = await listAssignments(swap.id);
    const pending = assignments.filter((a) => !a.sentAt && !a.reminderSentAt);
    const withGivers: Array<Assignment & { giver: Participant }> = [];
    for (const a of pending) {
      const giver = await findParticipant(swap.id, a.giverId);
      if (giver) withGivers.push({ ...a, giver });
    }
    if (withGivers.length > 0) {
      results.push({ swap, assignments: withGivers });
    }
  }
  return results;
}
