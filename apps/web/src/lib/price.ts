/**
 * Vue number inputs can coerce v-model to a number. Accept both shapes so
 * submit does not call .trim() on a number.
 */
export function priceOrUndefined(value: unknown): number | undefined {
  if (value === "" || value === null || value === undefined) return undefined;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return undefined;
    return Math.trunc(value);
  }
  const trimmed = String(value).trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return undefined;
  return Math.trunc(n);
}

/** Wording for a gift budget: a range, a minimum, or a maximum. */
export function formatGiftPrice(
  priceMin: number | null | undefined,
  priceMax: number | null | undefined,
): string | null {
  if (priceMin != null && priceMax != null) {
    return `Price range: $${priceMin} – $${priceMax}`;
  }
  if (priceMin != null) return `$${priceMin} and up`;
  if (priceMax != null) return `less than $${priceMax}`;
  return null;
}
