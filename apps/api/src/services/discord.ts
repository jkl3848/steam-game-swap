import { config } from "../config.js";

const DISCORD_API = "https://discord.com/api/v10";

export async function sendDirectMessage(
  discordUserId: string,
  content: string,
): Promise<boolean> {
  if (!config.discord.botToken) {
    console.warn("Discord bot not configured; skipping DM");
    return false;
  }

  try {
    const channelRes = await fetch(`${DISCORD_API}/users/@me/channels`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${config.discord.botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ recipient_id: discordUserId }),
    });

    if (!channelRes.ok) {
      console.error(`Failed to open DM channel: ${channelRes.status}`);
      return false;
    }

    const channel = (await channelRes.json()) as { id: string };
    const msgRes = await fetch(`${DISCORD_API}/channels/${channel.id}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${config.discord.botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content }),
    });

    if (!msgRes.ok) {
      console.error(`Failed to send DM: ${msgRes.status}`);
      return false;
    }

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
