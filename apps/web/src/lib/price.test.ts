import { describe, expect, it } from "vitest";
import { formatGiftPrice, priceOrUndefined } from "./price";

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

describe("formatGiftPrice", () => {
  it("shows a range when both prices are set", () => {
    expect(formatGiftPrice(10, 30)).toBe("Price range: $10 – $30");
  });

  it("says and up when only the minimum is set", () => {
    expect(formatGiftPrice(15, null)).toBe("$15 and up");
    expect(formatGiftPrice(15, undefined)).toBe("$15 and up");
  });

  it("says less than when only the maximum is set", () => {
    expect(formatGiftPrice(null, 30)).toBe("less than $30");
    expect(formatGiftPrice(undefined, 30)).toBe("less than $30");
  });

  it("returns nothing when neither price is set", () => {
    expect(formatGiftPrice(null, null)).toBeNull();
  });
});
