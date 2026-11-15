/** Clear all documents in the Firestore emulator between tests. */
export async function clearFirestoreEmulator(): Promise<void> {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  if (!host) {
    throw new Error("FIRESTORE_EMULATOR_HOST is not set");
  }

  const projectId =
    process.env.FIREBASE_PROJECT_ID ??
    process.env.GCLOUD_PROJECT ??
    "demo-steam-game-swap";

  const url = `http://${host}/emulator/v1/projects/${projectId}/databases/(default)/documents`;
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok && res.status !== 200) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to clear Firestore emulator (${res.status}): ${body}`);
  }
}

export function cookieHeaderFromResponse(setCookie: string | string[] | undefined): string {
  const headers = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return headers
    .map((h) => h.split(";")[0]!)
    .filter(Boolean)
    .join("; ");
}
