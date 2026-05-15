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
  databaseUrl: optional("DATABASE_URL"),
  redisUrl: optional("REDIS_URL", "redis://localhost:6379"),
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
