import {
  Client,
  GatewayIntentBits,
  Partials,
  type MessageCreateOptions,
} from "discord.js";
import { config } from "../config.js";

let client: Client | null = null;
let loginPromise: Promise<void> | null = null;

export function getDiscordClient(): Client | null {
  if (!config.discord.botToken) return null;
  if (!client) {
    client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
      partials: [Partials.Channel],
    });
  }
  return client;
}

export async function ensureBotReady(): Promise<Client | null> {
  const bot = getDiscordClient();
  if (!bot) return null;

  if (bot.isReady()) return bot;

  if (!loginPromise) {
    loginPromise = bot.login(config.discord.botToken).then(() => undefined);
  }
  await loginPromise;
  return bot;
}

export async function sendDirectMessage(
  discordUserId: string,
  content: string,
): Promise<boolean> {
  const bot = await ensureBotReady();
  if (!bot) {
    console.warn("Discord bot not configured; skipping DM");
    return false;
  }

  try {
    const user = await bot.users.fetch(discordUserId);
    await user.send({ content } satisfies MessageCreateOptions);
    return true;
  } catch (err) {
    console.error(`Failed to DM user ${discordUserId}:`, err);
    return false;
  }
}

export function buildMatchDm(params: {
  swapTitle: string;
  gifteeFirstName: string;
  steamUsername: string;
  discordTag?: string | null;
  wishlist: Array<{ name: string; storeUrl: string }>;
  priceMin?: number | null;
  priceMax?: number | null;
  myPageUrl: string;
}): string {
  const lines = [
    `🎮 **${params.swapTitle}** — your match is ready!`,
    ``,
    `You're gifting for **${params.gifteeFirstName}**`,
    `Steam: \`${params.steamUsername}\`${params.discordTag ? ` · Discord: ${params.discordTag}` : ""}`,
    ``,
    `**Wishlist:**`,
  ];

  if (params.wishlist.length === 0) {
    lines.push(`_(No games on wishlist yet)_`);
  } else {
    for (const item of params.wishlist) {
      lines.push(`• [${item.name}](${item.storeUrl})`);
    }
  }

  if (params.priceMin != null || params.priceMax != null) {
    const min = params.priceMin != null ? `$${params.priceMin}` : "—";
    const max = params.priceMax != null ? `$${params.priceMax}` : "—";
    lines.push(``, `**Price range:** ${min} – ${max}`);
  }

  lines.push(``, `View on web: ${params.myPageUrl}`);
  lines.push(`Mark your gift as sent when done!`);

  return lines.join("\n");
}

export function buildReminderDm(params: {
  swapTitle: string;
  giftDeadline: string;
  myPageUrl: string;
}): string {
  return [
    `⏰ **Gift reminder** — ${params.swapTitle}`,
    ``,
    `The deadline is **${params.giftDeadline}**. Haven't sent your gift yet?`,
    ``,
    params.myPageUrl,
  ].join("\n");
}

export function buildSignupDm(params: { swapTitle: string; code: string }): string {
  return [
    `✅ You're signed up for **${params.swapTitle}** (\`${params.code}\`).`,
    `We'll DM you again when matches are made!`,
  ].join("\n");
}
