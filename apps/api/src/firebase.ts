import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret, defineString } from "firebase-functions/params";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";
import { runAutoMatch, runGiftReminders } from "./services/swap-match.js";

/** Public (non-secret) config — values come from apps/api/.env.<project> at deploy time. */
defineString("WEB_ORIGIN", { default: "https://steam-game-swap-dev.web.app" });
defineString("API_PUBLIC_URL", { default: "https://steam-game-swap-dev.web.app" });
defineString("DISCORD_CLIENT_ID");
defineString("DISCORD_BOT_INVITE_URL");

const sessionSecret = defineSecret("SESSION_SECRET");
const discordClientSecret = defineSecret("DISCORD_CLIENT_SECRET");
const discordBotToken = defineSecret("DISCORD_BOT_TOKEN");
const steamApiKey = defineSecret("STEAM_WEB_API_KEY");

const secrets = [
  sessionSecret,
  discordClientSecret,
  discordBotToken,
  steamApiKey,
];

let cachedApp: FastifyInstance | undefined;

async function getApp(): Promise<FastifyInstance> {
  if (!cachedApp) {
    cachedApp = await buildApp();
    await cachedApp.ready();
  }
  return cachedApp;
}

export const api = onRequest(
  {
    region: "us-central1",
    secrets,
    invoker: "public",
  },
  async (req, res) => {
    const app = await getApp();
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      res.on("finish", done);
      res.on("close", () => {
        if (res.writableEnded) done();
      });
      res.on("error", (err) => {
        if (settled) return;
        settled = true;
        reject(err);
      });
      app.routing(req, res);
    });
  },
);

export const scheduler = onSchedule(
  {
    schedule: "every 1 hours",
    region: "us-central1",
    secrets,
  },
  async () => {
    await runAutoMatch();
    await runGiftReminders();
  },
);
