import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { config } from "./config.js";
import { authPlugin } from "./plugins/auth.js";
import { authApiRoutes, oauthRoutes } from "./routes/auth.js";
import { steamRoutes } from "./routes/steam.js";
import { swapRoutes } from "./routes/swaps.js";

export async function buildApp() {
  const app = Fastify({
    logger: config.nodeEnv !== "test",
  });

  await app.register(cors, {
    origin: config.webOrigin,
    credentials: true,
  });

  await app.register(cookie);

  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });

  await app.register(authPlugin);

  app.setErrorHandler((error: Error & { statusCode?: number; code?: string }, _request, reply) => {
    const statusCode = error.statusCode ?? 500;
    reply.status(statusCode).send({
      error: error.message,
      code: error.code,
    });
  });

  app.get("/health", async () => ({ ok: true }));

  await app.register(oauthRoutes);
  await app.register(async (api) => {
    await api.register(authApiRoutes);
    await api.register(swapRoutes);
    await api.register(steamRoutes);
  }, { prefix: "/api" });

  return app;
}
