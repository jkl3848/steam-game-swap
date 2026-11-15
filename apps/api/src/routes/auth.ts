import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { findUserById, upsertUser } from "../db/users.js";
import { createOAuthState, consumeOAuthState } from "../db/oauth-states.js";
import { config, assertDiscordOAuth } from "../config.js";
import { clearSessionCookie, setSessionCookie } from "../lib/session.js";

const DISCORD_API = "https://discord.com/api";

export async function authApiRoutes(app: FastifyInstance) {
  app.get("/auth/me", async (request) => {
    if (!request.creatorSession) {
      return { user: null };
    }
    const user = await findUserById(request.creatorSession.userId);
    if (!user) return { user: null };
    return {
      user: {
        id: user.id,
        discordId: user.discordId,
        discordTag: user.discordTag,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      },
    };
  });

  app.post("/auth/logout", async (_request, reply) => {
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get("/auth/config", async () => ({
    discordClientId: config.discord.clientId || null,
    botInviteUrl: config.discord.botInviteUrl,
    webOrigin: config.webOrigin,
    apiUrl: config.apiPublicUrl,
  }));
}

export async function oauthRoutes(app: FastifyInstance) {
  app.get("/auth/discord", async (request, reply) => {
    return handleDiscordLogin(request, reply);
  });

  app.get("/auth/discord/callback", async (request, reply) => {
    return handleDiscordCallback(request, reply);
  });

  app.get("/auth/discord/link/:code", async (request, reply) => {
    return handleDiscordLink(request, reply);
  });
}

export async function handleDiscordLogin(_request: FastifyRequest, reply: FastifyReply) {
  assertDiscordOAuth();
  const state = await createOAuthState("creator");

  const params = new URLSearchParams({
    client_id: config.discord.clientId,
    redirect_uri: `${config.apiPublicUrl}/auth/discord/callback`,
    response_type: "code",
    scope: "identify",
    state,
  });

  return reply.redirect(`${DISCORD_API}/oauth2/authorize?${params}`);
}

export async function handleDiscordLink(request: FastifyRequest, reply: FastifyReply) {
  assertDiscordOAuth();
  const { code } = request.params as { code: string };
  const state = await createOAuthState("participant_link", code.toUpperCase());

  const params = new URLSearchParams({
    client_id: config.discord.clientId,
    redirect_uri: `${config.apiPublicUrl}/auth/discord/callback`,
    response_type: "code",
    scope: "identify",
    state,
  });

  return reply.redirect(`${DISCORD_API}/oauth2/authorize?${params}`);
}

export async function handleDiscordCallback(request: FastifyRequest, reply: FastifyReply) {
  assertDiscordOAuth();
  const { code, state } = request.query as { code?: string; state?: string };
  if (!code || !state) {
    return reply.redirect(`${config.webOrigin}/?error=oauth`);
  }

  const stored = await consumeOAuthState(state);
  if (!stored) {
    return reply.redirect(`${config.webOrigin}/?error=state`);
  }

  const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.discord.clientId,
      client_secret: config.discord.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: `${config.apiPublicUrl}/auth/discord/callback`,
    }),
  });

  if (!tokenRes.ok) {
    return reply.redirect(`${config.webOrigin}/?error=token`);
  }

  const tokenData = (await tokenRes.json()) as { access_token: string };
  const userRes = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userRes.ok) {
    return reply.redirect(`${config.webOrigin}/?error=user`);
  }

  const discordUser = (await userRes.json()) as {
    id: string;
    username: string;
    global_name?: string;
    avatar?: string;
  };

  const tag = discordUser.global_name ?? discordUser.username;
  const avatarUrl = discordUser.avatar
    ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
    : null;

  if (stored.type === "participant_link" && stored.swapCode) {
    return reply.redirect(
      `${config.webOrigin}/join/${stored.swapCode}?discordId=${discordUser.id}&discordTag=${encodeURIComponent(tag)}`,
    );
  }

  const user = await upsertUser({
    discordId: discordUser.id,
    discordTag: tag,
    displayName: tag,
    avatarUrl,
  });

  await setSessionCookie(request, reply, { type: "creator", userId: user.id });

  // 200 HTML (not 302) so Firebase Hosting / the browser keep Set-Cookie
  // on the Discord OAuth return trip.
  return sendClientRedirect(reply, `${config.webOrigin}/dashboard`);
}

function sendClientRedirect(reply: FastifyReply, url: string) {
  const safeUrl = JSON.stringify(url);
  reply.header("Cache-Control", "private, no-store");
  return reply.type("text/html; charset=utf-8").send(
    `<!doctype html><html><head><meta http-equiv="refresh" content="0;url=${url.replace(/"/g, "")}"></head><body><script>location.replace(${safeUrl})</script><p><a href=${safeUrl}>Continue</a></p></body></html>`,
  );
}
