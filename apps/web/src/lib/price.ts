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
