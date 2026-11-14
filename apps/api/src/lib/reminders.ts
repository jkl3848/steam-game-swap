const MS_PER_DAY = 86_400_000;

/**
 * Returns true when `now` is in the reminder window: the gift deadline is still
 * in the future and at most `daysBefore` days away (i.e. on or after deadline - N days).
 */
export function isInGiftReminderWindow(
  now: Date,
  giftDeadline: Date,
  daysBefore: number,
): boolean {
  const nowMs = now.getTime();
  const deadlineMs = giftDeadline.getTime();
  if (deadlineMs <= nowMs) return false;

  const windowEndMs = nowMs + daysBefore * MS_PER_DAY;
  return deadlineMs <= windowEndMs;
}
