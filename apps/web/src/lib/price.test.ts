import { describe, expect, it } from "vitest";
import { priceOrUndefined } from "./price";

describe("priceOrUndefined", () => {
  it("treats blank values as unset", () => {
    expect(priceOrUndefined("")).toBeUndefined();
    expect(priceOrUndefined("   ")).toBeUndefined();
    expect(priceOrUndefined(null)).toBeUndefined();
    expect(priceOrUndefined(undefined)).toBeUndefined();
    expect(priceOrUndefined(Number.NaN)).toBeUndefined();
  });

  it("parses string prices", () => {
    expect(priceOrUndefined("15")).toBe(15);
    expect(priceOrUndefined(" 15.9 ")).toBe(15);
  });

  it("accepts numeric prices from Vue number inputs", () => {
    expect(priceOrUndefined(15)).toBe(15);
    expect(priceOrUndefined(15.9)).toBe(15);
    expect(priceOrUndefined(0)).toBe(0);
  });

  it("rejects non-numeric strings", () => {
    expect(priceOrUndefined("abc")).toBeUndefined();
  });
});
