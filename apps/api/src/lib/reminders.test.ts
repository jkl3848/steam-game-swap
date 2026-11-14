import { describe, expect, it } from "vitest";
import { isInGiftReminderWindow } from "./reminders.js";

describe("isInGiftReminderWindow", () => {
  const now = new Date("2026-05-10T12:00:00.000Z");

  it("returns true when deadline is exactly N days away", () => {
    const deadline = new Date("2026-05-13T12:00:00.000Z");
    expect(isInGiftReminderWindow(now, deadline, 3)).toBe(true);
  });

  it("returns true when deadline is 1 day away", () => {
    const deadline = new Date("2026-05-11T12:00:00.000Z");
    expect(isInGiftReminderWindow(now, deadline, 3)).toBe(true);
  });

  it("returns false when deadline is more than N days away", () => {
    const deadline = new Date("2026-05-20T12:00:00.000Z");
    expect(isInGiftReminderWindow(now, deadline, 3)).toBe(false);
  });

  it("returns false when deadline has passed", () => {
    const deadline = new Date("2026-05-09T12:00:00.000Z");
    expect(isInGiftReminderWindow(now, deadline, 3)).toBe(false);
  });
});
