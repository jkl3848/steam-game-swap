import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";

export function generateSecretToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function hashToken(token: string): Promise<string> {
  return bcrypt.hash(token, 12);
}

export async function verifyToken(token: string, hash: string): Promise<boolean> {
  return bcrypt.compare(token, hash);
}
