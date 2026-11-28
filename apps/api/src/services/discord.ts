import { config } from "../config.js";

const DISCORD_API = "https://discord.com/api/v10";
const DISCORD_USER_AGENT = "DiscordBot (https://steam-game-swap-dev.web.app, 1.0)";

function discordHeaders(): Record<string, string> {
  return {
    Authorization: `Bot ${config.discord.botToken}`,
    "Content-Type": "application/json",
    "User-Agent": DISCORD_USER_AGENT,
  };
}

async function discordError(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "";
  }
}

export async function sendDirectMessage(
  discordUserId: string,
  content: string,
): Promise<boolean> {
  if (discordUserId.startsWith("dev:")) return false;
  if (!config.discord.botToken) {
    console.warn("Discord bot not configured; skipping DM");
    return false;
  }

  try {
    const channelRes = await fetch(`${DISCORD_API}/users/@me/channels`, {
      method: "POST",
      headers: discordHeaders(),
      body: JSON.stringify({ recipient_id: discordUserId }),
    });

    if (!channelRes.ok) {
      console.error(
        `Failed to open DM channel: ${channelRes.status} ${await discordError(channelRes)}`,
      );
      return false;
    }

    const channel = (await channelRes.json()) as { id: string };
    const msgRes = await fetch(`${DISCORD_API}/channels/${channel.id}/messages`, {
      method: "POST",
      headers: discordHeaders(),
      body: JSON.stringify({ content }),
    });

    if (!msgRes.ok) {
      console.error(`Failed to send DM: ${msgRes.status} ${await discordError(msgRes)}`);
      return false;
    }

    return true;
  } catch (err) {
    console.error(`Failed to DM user ${discordUserId}:`, err);
    return false;
  }
}

function giftPriceLine(
  priceMin: number | null | undefined,
  priceMax: number | null | undefined,
): string | null {
  if (priceMin != null && priceMax != null) {
    return `**Price range:** $${priceMin} – $${priceMax}`;
  }
  if (priceMin != null) return `**$${priceMin} and up**`;
  if (priceMax != null) return `**less than $${priceMax}**`;
  return null;
}

export function steamProfileUrl(steamId: string | null | undefined, steamUsername: string): string {
  if (steamId && /^\d{17}$/.test(steamId)) {
    return `https://steamcommunity.com/profiles/${steamId}`;
  }
  return `https://steamcommunity.com/id/${encodeURIComponent(steamUsername)}`;
}

export function buildMatchDm(params: {
  swapTitle: string;
  gifteeFirstName: string;
  steamUsername: string;
  steamProfileUrl: string;
  discordTag?: string | null;
  priceMin?: number | null;
  priceMax?: number | null;
  myPageUrl: string;
}): string {
  const lines = [
    `🎮 **${params.swapTitle}** — your match is ready!`,
    ``,
    `You're gifting for **${params.gifteeFirstName}**`,
    `Steam: **${params.steamUsername}** — [Steam profile](${params.steamProfileUrl})`,
  ];

  if (params.discordTag) {
    lines.push(`Discord: ${params.discordTag}`);
  }

  const priceLine = giftPriceLine(params.priceMin, params.priceMax);
  if (priceLine) lines.push(``, priceLine);

  lines.push(
    ``,
    `**Next steps:**`,
    `1. Friend them on Steam using their profile link above`,
    `2. Once they accept, send their gift through Steam`,
    `3. Open your swap dashboard to view their wishlist:`,
    params.myPageUrl,
    ``,
    `Mark your gift as sent when done!`,
  );

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

export function buildCancelDm(params: { swapTitle: string; code: string }): string {
  return [
    `❌ **${params.swapTitle}** (\`${params.code}\`) has been cancelled by the organizer.`,
    `You no longer need to send a gift for this swap.`,
  ].join("\n");
}
