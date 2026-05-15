import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";
import { runAutoMatch, runGiftReminders } from "./services/swap-match.js";

let cachedApp: FastifyInstance | undefined;

async function getApp(): Promise<FastifyInstance> {
  if (!cachedApp) {
    cachedApp = await buildApp();
    await cachedApp.ready();
  }
  return cachedApp;
}

export const api = onRequest(async (req, res) => {
  const app = await getApp();
  app.routing(req, res);
});

export const scheduler = onSchedule("every 1 hours", async () => {
  await runAutoMatch();
  await runGiftReminders();
});
