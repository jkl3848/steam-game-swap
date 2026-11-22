import "dotenv/config";

const DEV_SESSION_PLACEHOLDER = "dev-only-not-for-production";

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

function resolveSessionSecret(): string {
  const secret = process.env.SESSION_SECRET ?? "";
  const isProd = optional("NODE_ENV", "development") === "production";

  if (isProd) {
    if (!secret || secret.length < 32) {
      throw new Error("SESSION_SECRET must be set to a random string of at least 32 characters in production");
    }
    return secret;
  }

  return secret || DEV_SESSION_PLACEHOLDER;
}

export const config = {
  nodeEnv: optional("NODE_ENV", "development"),
  port: Number(optional("PORT", "3000")),
  isProd: optional("NODE_ENV", "development") === "production",
  firebaseProjectId: optional("FIREBASE_PROJECT_ID"),
  webOrigin: optional("WEB_ORIGIN", "http://localhost:5173"),
  apiPublicUrl: optional("API_PUBLIC_URL", "http://localhost:3000"),
  sessionSecret: resolveSessionSecret(),
  discord: {
    clientId: optional("DISCORD_CLIENT_ID"),
    clientSecret: optional("DISCORD_CLIENT_SECRET"),
    botToken: optional("DISCORD_BOT_TOKEN"),
    guildId: optional("DISCORD_GUILD_ID"),
    botInviteUrl: optional(
      "DISCORD_BOT_INVITE_URL",
      "https://discord.com/channels/@me",
    ),
  },
  steamApiKey: optional("STEAM_WEB_API_KEY"),
  giftReminderDaysBefore: Number(optional("GIFT_REMINDER_DAYS_BEFORE", "3")),
};

export function assertDiscordOAuth() {
  if (!config.discord.clientId || !config.discord.clientSecret) {
    throw new Error("Discord OAuth not configured");
  }
}

/**
 * Extra test actions (add fake participants, open the swap as them).
 * On for local development only. The hosted site stays off, including the
 * Firebase project whose id ends in `-dev`. Set DEV_TOOLS=true to force them on.
 */
export function devToolsEnabled(): boolean {
  const flag = optional("DEV_TOOLS").trim().toLowerCase();
  if (flag === "false" || flag === "0") return false;
  if (flag === "true" || flag === "1") return true;
  if (process.env.K_SERVICE && process.env.FUNCTIONS_EMULATOR !== "true") return false;
  return !config.isProd;
}

export function assertDevTools() {
  if (!devToolsEnabled()) {
    const err = new Error("Not found");
    (err as Error & { statusCode: number }).statusCode = 404;
    throw err;
  }
}
