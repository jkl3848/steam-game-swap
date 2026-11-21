import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { parseIncomingJson } from "./json-body.js";

describe("parseIncomingJson", () => {
  it("uses the body Firebase already parsed and does not wait on the stream", () => {
    const payload = new Readable({
      read() {
        /* never emits — a Cloud Function request looks like this */
      },
    }) as Readable & { body?: unknown; rawBody?: Buffer };
    payload.rawBody = Buffer.from(JSON.stringify({ title: "Hang" }));
    payload.body = { title: "Hang" };

    let called = false;
    parseIncomingJson(payload, (err, body) => {
      called = true;
      expect(err).toBeNull();
      expect(body).toEqual({ title: "Hang" });
    });
    expect(called).toBe(true);
  });

  it("uses a parsed body even when rawBody is missing", () => {
    const payload = new Readable({
      read() {
        /* never emits */
      },
    }) as Readable & { body?: unknown; rawBody?: Buffer };
    payload.body = { title: "NoRaw" };

    let called = false;
    parseIncomingJson(payload, (err, body) => {
      called = true;
      expect(err).toBeNull();
      expect(body).toEqual({ title: "NoRaw" });
    });
    expect(called).toBe(true);
  });

  it("does not hang when the stream already ended with no body", () => {
    const payload = {
      readableEnded: true,
      on() {
        throw new Error("should not subscribe to a drained stream");
      },
    } as unknown as Parameters<typeof parseIncomingJson>[0];

    let called = false;
    parseIncomingJson(payload, (err, body) => {
      called = true;
      expect(err).toBeNull();
      expect(body).toBeUndefined();
    });
    expect(called).toBe(true);
  });

  it("parses a normal request stream", () => {
    return new Promise<void>((resolve, reject) => {
      const payload = Readable.from([Buffer.from('{"title":"Local"}')]) as Readable & {
        body?: unknown;
        rawBody?: Buffer;
      };
      parseIncomingJson(payload, (err, body) => {
        try {
          expect(err).toBeNull();
          expect(body).toEqual({ title: "Local" });
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  });

  it("rejects invalid JSON", () => {
    return new Promise<void>((resolve, reject) => {
      const payload = Readable.from([Buffer.from("{")]) as Readable & {
        body?: unknown;
        rawBody?: Buffer;
      };
      parseIncomingJson(payload, (err) => {
        try {
          expect(err).toBeInstanceOf(Error);
          expect((err as Error & { statusCode?: number }).statusCode).toBe(400);
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  });
});
