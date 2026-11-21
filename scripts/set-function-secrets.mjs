/**
 * Copies production secrets from the local gitignored .env into
 * Google Secret Manager for Cloud Functions. Does not print secret values.
 *
 * Usage (repo root): node scripts/set-function-secrets.mjs
 */
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ID = "steam-game-swap-dev";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function parseEnv(path) {
  const out = {};
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    console.error(`Missing ${path}. Copy .env.example to .env first.`);
    process.exit(1);
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function setSecret(key, value) {
  const result = spawnSync(
    "npx",
    [
      "firebase-tools@latest",
      "functions:secrets:set",
      key,
      "--data-file",
      "-",
      "--project",
      PROJECT_ID,
      "--force",
      "--non-interactive",
    ],
    { input: value, encoding: "utf8", shell: true, cwd: ROOT },
  );
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout || `Failed to set ${key}`);
    process.exit(result.status ?? 1);
  }
  console.log(`Stored secret ${key} in Google Secret Manager`);
}

const env = parseEnv(join(ROOT, ".env"));
const required = [
  "DISCORD_CLIENT_ID",
  "DISCORD_CLIENT_SECRET",
  "DISCORD_BOT_TOKEN",
  "DISCORD_BOT_INVITE_URL",
  "STEAM_WEB_API_KEY",
];
const missing = required.filter((key) => !env[key]);
if (missing.length) {
  console.error(`Add these to .env first: ${missing.join(", ")}`);
  process.exit(1);
}

let sessionSecret = env.SESSION_SECRET ?? "";
if (!sessionSecret || sessionSecret.length < 32 || sessionSecret.includes("change-me")) {
  sessionSecret = randomBytes(32).toString("hex");
  console.log("Generated a production SESSION_SECRET (not using the local placeholder).");
}

setSecret("SESSION_SECRET", sessionSecret);
setSecret("DISCORD_CLIENT_SECRET", env.DISCORD_CLIENT_SECRET);
setSecret("DISCORD_BOT_TOKEN", env.DISCORD_BOT_TOKEN);
setSecret("STEAM_WEB_API_KEY", env.STEAM_WEB_API_KEY);

const publicEnv = [
  "WEB_ORIGIN=https://steam-game-swap-dev.web.app",
  "API_PUBLIC_URL=https://steam-game-swap-dev.web.app",
  `DISCORD_CLIENT_ID=${env.DISCORD_CLIENT_ID}`,
  `DISCORD_BOT_INVITE_URL=${env.DISCORD_BOT_INVITE_URL}`,
];
if (env.DISCORD_GUILD_ID) {
  publicEnv.push(`DISCORD_GUILD_ID=${env.DISCORD_GUILD_ID}`);
}

writeFileSync(join(ROOT, "apps/api/.env.steam-game-swap-dev"), `${publicEnv.join("\n")}\n`);
console.log("Wrote apps/api/.env.steam-game-swap-dev with public production URLs (gitignored).");
console.log("Next: pnpm deploy:functions");
