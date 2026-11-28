import type { FastifyInstance } from "fastify";
import { searchSteamStore } from "../services/steam.js";

export async function steamRoutes(app: FastifyInstance) {
  app.get("/steam/search", async (request) => {
    const { q } = request.query as { q?: string };
    if (!q || q.trim().length < 2) {
      return { results: [] };
    }
    const results = await searchSteamStore(q.trim());
    return { results };
  });
}
