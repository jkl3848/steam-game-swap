import { initializeApp, getApps, type App } from "firebase-admin/app";
import { getFirestore, type Firestore, Timestamp } from "firebase-admin/firestore";

let app: App;
let db: Firestore;

export function getDb(): Firestore {
  if (!db) {
    if (getApps().length === 0) {
      const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.GCLOUD_PROJECT;
      app = projectId ? initializeApp({ projectId }) : initializeApp();
    } else {
      app = getApps()[0]!;
    }
    db = getFirestore(app);
  }
  return db;
}

export function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === "string") return new Date(value);
  return new Date();
}

export function toTimestamp(date: Date): Timestamp {
  return Timestamp.fromDate(date);
}

export function newId(): string {
  return crypto.randomUUID();
}
