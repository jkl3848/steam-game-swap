import { getDb, newId, toDate, toTimestamp } from "./firestore.js";
import type { User } from "./types.js";

function docToUser(id: string, data: FirebaseFirestore.DocumentData): User {
  return {
    id,
    discordId: data.discordId as string,
    discordTag: (data.discordTag as string) ?? null,
    displayName: (data.displayName as string) ?? null,
    avatarUrl: (data.avatarUrl as string) ?? null,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

export async function findUserById(id: string): Promise<User | null> {
  const snap = await getDb().collection("users").doc(id).get();
  if (!snap.exists) return null;
  return docToUser(snap.id, snap.data()!);
}

export async function findUserByDiscordId(discordId: string): Promise<User | null> {
  const q = await getDb().collection("users").where("discordId", "==", discordId).limit(1).get();
  if (q.empty) return null;
  const doc = q.docs[0]!;
  return docToUser(doc.id, doc.data());
}

export async function upsertUser(data: {
  discordId: string;
  discordTag: string;
  displayName: string;
  avatarUrl: string | null;
}): Promise<User> {
  const existing = await findUserByDiscordId(data.discordId);
  const now = new Date();

  if (existing) {
    await getDb().collection("users").doc(existing.id).update({
      discordTag: data.discordTag,
      displayName: data.displayName,
      avatarUrl: data.avatarUrl,
      updatedAt: toTimestamp(now),
    });
    return { ...existing, ...data, updatedAt: now };
  }

  const id = newId();
  const user: User = {
    id,
    ...data,
    createdAt: now,
    updatedAt: now,
  };
  await getDb().collection("users").doc(id).set({
    discordId: data.discordId,
    discordTag: data.discordTag,
    displayName: data.displayName,
    avatarUrl: data.avatarUrl,
    createdAt: toTimestamp(now),
    updatedAt: toTimestamp(now),
  });
  return user;
}
