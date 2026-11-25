import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import { config } from "./config.js";
import { parseIncomingJson } from "./lib/json-body.js";
import { authPlugin } from "./plugins/auth.js";
import { authApiRoutes, oauthRoutes } from "./routes/auth.js";
import { steamRoutes } from "./routes/steam.js";
import { swapRoutes } from "./routes/swaps.js";

export async function buildApp() {
  const app = Fastify({
    logger: config.nodeEnv !== "test",
    trustProxy: true,
  });

  // Firebase has already consumed the body. Reading it again hangs the function.
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { bodyLimit: 1_048_576 }, (req, payload, done) => {
    type BodyCarrier = {
      body?: unknown;
      rawBody?: Buffer | Uint8Array | string;
      readableEnded?: boolean;
      destroyed?: boolean;
      on?: (...args: unknown[]) => unknown;
    };
    const stream = payload as BodyCarrier;
    const raw = req.raw as BodyCarrier;
    // functions-framework attaches body/rawBody on the IncomingMessage.
    if (stream.body === undefined && raw?.body !== undefined) stream.body = raw.body;
    if (stream.rawBody === undefined && raw?.rawBody !== undefined) stream.rawBody = raw.rawBody;
    parseIncomingJson(stream as Parameters<typeof parseIncomingJson>[0], done);
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

  // Attach on the root instance so session hooks apply to /auth and /api routes.
  // `app.register(authPlugin)` would encapsulate the hooks and silently skip them.
  await authPlugin(app);

  app.setErrorHandler((error: Error & { statusCode?: number; code?: string; cause?: unknown }, request, reply) => {
    const zod = error instanceof ZodError
      ? error
      : error.cause instanceof ZodError
        ? error.cause
        : null;
    if (zod) {
      const message = zod.issues.map((issue) => issue.message).filter(Boolean).join(". ");
      reply.status(400).send({ error: message || "Invalid request", code: "VALIDATION" });
      return;
    }
    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 500) {
      request.log.error({ err: error }, error.message);
    }
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
