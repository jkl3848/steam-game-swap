import { z } from "zod";

/** Empty number inputs arrive as "" or null. Treat those as "not set". */
function emptyToUndefined(value: unknown) {
  if (value === "" || value === null || value === undefined) return undefined;
  if (typeof value === "number" && Number.isNaN(value)) return undefined;
  return value;
}

const optionalPrice = z.preprocess(emptyToUndefined, z.number().int().min(0).optional());

export const createSwapSchema = z.object({
  title: z.string().min(1).max(120),
  rulesText: z.string().max(2000).optional(),
  startDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
  giftDeadline: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
  priceMin: optionalPrice,
  priceMax: optionalPrice,
  autoMatch: z.boolean().default(true),
});

export const joinSwapSchema = z.object({
  firstName: z.string().min(1).max(80),
  steamUsername: z.string().min(1).max(80),
  discordUserId: z.string().min(1),
  discordTag: z.string().optional(),
  wishlist: z
    .array(
      z.object({
        steamAppId: z.number().int().positive(),
        name: z.string().min(1).max(200),
        storeUrl: z.string().url(),
        priceHint: z.string().optional(),
      }),
    )
    .max(500)
    .default([]),
});

export const updateParticipantSchema = z.object({
  firstName: z.string().min(1).max(80).optional(),
  steamUsername: z.string().min(1).max(80).optional(),
  discordUserId: z.string().min(1).optional(),
  discordTag: z.string().optional(),
});

export const wishlistItemSchema = z.object({
  steamAppId: z.number().int().positive(),
  name: z.string().min(1).max(200),
  storeUrl: z.string().url(),
  priceHint: z.string().optional(),
});

export const wishlistUpdateSchema = z.object({
  items: z.array(wishlistItemSchema).max(500),
});

export const blackoutSchema = z.object({
  participantAId: z.string().min(1),
  participantBId: z.string().min(1),
});

export const updateSwapSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  rulesText: z.string().max(2000).optional(),
  startDate: z.string().optional(),
  giftDeadline: z.string().optional(),
  priceMin: z.number().int().min(0).nullable().optional(),
  priceMax: z.number().int().min(0).nullable().optional(),
  status: z.enum(["open", "locked", "cancelled"]).optional(),
  autoMatch: z.boolean().optional(),
});

export type CreateSwapInput = z.infer<typeof createSwapSchema>;
export type JoinSwapInput = z.infer<typeof joinSwapSchema>;
