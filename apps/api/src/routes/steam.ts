import type { FastifyInstance } from "fastify";
import {
  importWishlist,
  resolveSteamId,
  searchSteamStore,
  SteamWishlistError,
} from "../services/steam.js";
import { requireParticipantForSwap } from "../plugins/auth.js";
import { findSwapByCode } from "../db/swaps.js";

export async function steamRoutes(app: FastifyInstance) {
  app.get("/steam/search", async (request) => {
    const { q } = request.query as { q?: string };
    if (!q || q.trim().length < 2) {
      return { results: [] };
    }
    const results = await searchSteamStore(q.trim());
    return { results };
  });

  app.post("/swaps/:code/me/wishlist/import", async (request) => {
    const { code } = request.params as { code: string };
    const swap = await findSwapByCode(code);
    if (!swap) {
      const err = new Error("Not found");
      (err as Error & { statusCode: number }).statusCode = 404;
      throw err;
    }

    const participant = await requireParticipantForSwap(request, swap.id);
    let steamId =
      participant.steamId ?? (await resolveSteamId(participant.steamUsername));
    if (!steamId) {
      const err = new Error(
        "Could not resolve Steam profile. Check the username or add games with search.",
      );
      (err as Error & { statusCode: number }).statusCode = 400;
      throw err;
    }

    try {
      try {
        const items = await importWishlist(steamId);
        return { items };
      } catch (e) {
        // Cached steamId may be stale — re-resolve once on empty/private.
        if (
          e instanceof SteamWishlistError &&
          e.code === "EMPTY_OR_PRIVATE" &&
          participant.steamId
        ) {
          const resolved = await resolveSteamId(participant.steamUsername);
          if (resolved && resolved !== steamId) {
            steamId = resolved;
            const items = await importWishlist(steamId);
            return { items };
          }
        }
        throw e;
      }
    } catch (e) {
      if (e instanceof SteamWishlistError) {
        const err = new Error(e.message);
        (err as Error & { statusCode: number; code: string }).statusCode = 400;
        (err as Error & { code: string }).code = e.code;
        throw err;
      }
      throw e;
    }
  });
}
