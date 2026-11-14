import { getDb, newId, toDate, toTimestamp } from "./firestore.js";
import type { OAuthState } from "./types.js";

const TTL_MS = 10 * 60 * 1000;

export async function createOAuthState(
  type: OAuthState["type"],
  swapCode?: string,
): Promise<string> {
  const id = newId();
  const expiresAt = new Date(Date.now() + TTL_MS);
  await getDb().collection("oauthStates").doc(id).set({
    type,
    swapCode: swapCode ?? null,
    expiresAt: toTimestamp(expiresAt),
  });
  return id;
}

export async function consumeOAuthState(id: string): Promise<OAuthState | null> {
  const ref = getDb().collection("oauthStates").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;

  const data = snap.data()!;
  const expiresAt = toDate(data.expiresAt);
  await ref.delete();

  if (expiresAt.getTime() < Date.now()) return null;

  return {
    id: snap.id,
    type: data.type as OAuthState["type"],
    swapCode: (data.swapCode as string) ?? undefined,
    expiresAt,
  };
}
