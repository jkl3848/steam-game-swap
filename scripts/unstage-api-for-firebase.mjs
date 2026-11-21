import { copyFileSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = join(ROOT, "apps/api");
const pkgPath = join(apiDir, "package.json");
const backupPath = join(apiDir, "package.json.firebase-backup");

if (existsSync(backupPath)) {
  copyFileSync(backupPath, pkgPath);
  rmSync(backupPath);
  console.log("Restored apps/api/package.json");
}
