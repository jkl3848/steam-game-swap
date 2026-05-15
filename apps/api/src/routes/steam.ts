import type { FastifyInstance } from "fastify";
import { importWishlist, resolveSteamId, searchSteamStore } from "../services/steam.js";
import { requireParticipantForSwap } from "../plugins/auth.js";
import { prisma } from "../db.js";

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
    const swap = await prisma.swap.findUnique({
      where: { code: code.toUpperCase() },
    });
    if (!swap) {
      const err = new Error("Not found");
      (err as Error & { statusCode: number }).statusCode = 404;
      throw err;
    }

    const participant = await requireParticipantForSwap(request, swap.id);
    const steamId =
      participant.steamId ?? (await resolveSteamId(participant.steamUsername));
    if (!steamId) {
      return { error: "Could not resolve Steam profile", items: [] };
    }

    const items = await importWishlist(steamId);
    return { items };
  });
}
