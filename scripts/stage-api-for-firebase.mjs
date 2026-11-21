/**
 * Firebase Cloud Build runs npm, which cannot resolve pnpm workspace:*.
 * Copy the built shared package into apps/api/vendor and point package.json at it.
 */
import { cpSync, copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = join(ROOT, "apps/api");
const vendorDir = join(apiDir, "vendor/shared");
const pkgPath = join(apiDir, "package.json");
const backupPath = join(apiDir, "package.json.firebase-backup");

function run(cmd, args) {
  const result = spawnSync(cmd, args, { cwd: ROOT, shell: true, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("pnpm", ["--dir", "packages/shared", "build"]);
run("pnpm", ["--dir", "apps/api", "build"]);

rmSync(vendorDir, { recursive: true, force: true });
mkdirSync(vendorDir, { recursive: true });
cpSync(join(ROOT, "packages/shared/package.json"), join(vendorDir, "package.json"));
cpSync(join(ROOT, "packages/shared/dist"), join(vendorDir, "dist"), { recursive: true });

copyFileSync(pkgPath, backupPath);
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
pkg.dependencies["@steam-game-swap/shared"] = "file:vendor/shared";
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log("Staged @steam-game-swap/shared as file:vendor/shared for Cloud Build");
