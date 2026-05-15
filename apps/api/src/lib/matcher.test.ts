import { describe, expect, it } from "vitest";
import { findDerangementWithBlackouts, isMatchingPossible } from "./matcher.js";

describe("matcher", () => {
  const four = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];

  it("finds a derangement for 3 people", () => {
    const three = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const result = findDerangementWithBlackouts(three, []);
    expect(result).not.toBeNull();
    expect(result!.size).toBe(3);
    for (const [giver, receiver] of result!) {
      expect(giver).not.toBe(receiver);
    }
  });

  it("respects blackouts when a solution exists", () => {
    const result = findDerangementWithBlackouts(four, [["a", "b"]]);
    expect(result).not.toBeNull();
    expect(result!.get("a")).not.toBe("b");
    expect(result!.get("b")).not.toBe("a");
  });

  it("detects impossible matching with 3 people and mutual blackout", () => {
    const three = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(isMatchingPossible(three, [["a", "b"]])).toBe(false);
  });
});
