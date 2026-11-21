type Done = (err: Error | null, body?: unknown) => void;

type MaybeParsed = {
  body?: unknown;
  rawBody?: Buffer | Uint8Array | string;
  readableEnded?: boolean;
  destroyed?: boolean;
  on?: (event: string, listener: (...args: any[]) => void) => unknown;
};

function invalidJson(err: unknown): Error {
  const error = err instanceof Error ? err : new Error("Invalid JSON");
  (error as Error & { statusCode: number }).statusCode = 400;
  return error;
}

function parseText(text: string, done: Done): void {
  const trimmed = text.trim();
  if (!trimmed) {
    done(null, undefined);
    return;
  }
  try {
    done(null, JSON.parse(trimmed));
  } catch (err) {
    done(invalidJson(err), undefined);
  }
}

function rawBodyToString(raw: Buffer | Uint8Array | string): string {
  if (typeof raw === "string") return raw;
  if (Buffer.isBuffer(raw)) return raw.toString("utf8");
  return Buffer.from(raw).toString("utf8");
}

/**
 * Cloud Functions / functions-framework already consume the request stream and
 * attach `body` (and sometimes `rawBody`). Fastify's default JSON parser waits
 * for stream events that never arrive, so POSTs hang until Hosting returns 502.
 */
export function parseIncomingJson(payload: MaybeParsed, done: Done): void {
  // Prefer the object Firebase already parsed — do not require rawBody.
  if (payload.body !== undefined && typeof payload.body !== "string") {
    done(null, payload.body);
    return;
  }

  if (payload.rawBody != null) {
    parseText(rawBodyToString(payload.rawBody), done);
    return;
  }

  if (typeof payload.body === "string") {
    parseText(payload.body, done);
    return;
  }

  // Stream already drained with nothing left to read — fail closed instead of hanging.
  if (payload.readableEnded || payload.destroyed || typeof payload.on !== "function") {
    done(null, undefined);
    return;
  }

  const chunks: Buffer[] = [];
  payload.on("data", (chunk: Buffer | string) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
  payload.on("end", () => {
    parseText(Buffer.concat(chunks).toString("utf8"), done);
  });
  payload.on("error", (err: Error) => done(err, undefined));
}
