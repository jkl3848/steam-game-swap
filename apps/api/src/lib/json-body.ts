import { Readable } from "node:stream";

type Done = (err: Error | null, body?: unknown) => void;

type MaybeParsed = Readable & {
  body?: unknown;
  rawBody?: Buffer;
};

function invalidJson(err: unknown): Error {
  const error = err instanceof Error ? err : new Error("Invalid JSON");
  (error as Error & { statusCode: number }).statusCode = 400;
  return error;
}

/**
 * Cloud Functions already read the body onto `rawBody` / `body`. Fastify's
 * default JSON parser waits for stream events that never arrive, so every
 * POST hangs until Hosting returns 502.
 */
export function parseIncomingJson(payload: MaybeParsed, done: Done): void {
  if (Buffer.isBuffer(payload.rawBody)) {
    if (payload.body !== undefined && typeof payload.body !== "string") {
      done(null, payload.body);
      return;
    }
    const text = payload.rawBody.toString("utf8").trim();
    if (!text) {
      done(null, undefined);
      return;
    }
    try {
      done(null, JSON.parse(text));
    } catch (err) {
      done(invalidJson(err), undefined);
    }
    return;
  }

  const chunks: Buffer[] = [];
  payload.on("data", (chunk: Buffer | string) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
  payload.on("end", () => {
    const text = Buffer.concat(chunks).toString("utf8").trim();
    if (!text) {
      done(null, undefined);
      return;
    }
    try {
      done(null, JSON.parse(text));
    } catch (err) {
      done(invalidJson(err), undefined);
    }
  });
  payload.on("error", (err) => done(err, undefined));
}
