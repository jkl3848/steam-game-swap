export type MatchParticipant = { id: string };

export function findDerangementWithBlackouts(
  participants: MatchParticipant[],
  blackoutPairs: Array<[string, string]>,
  maxAttempts = 5000,
): Map<string, string> | null {
  const n = participants.length;
  if (n < 2) return null;

  const ids = participants.map((p) => p.id);
  const blocked = new Set<string>();
  for (const [a, b] of blackoutPairs) {
    blocked.add(`${a}:${b}`);
    blocked.add(`${b}:${a}`);
  }

  if (n <= 10) {
    return exhaustiveSearch(ids, blocked);
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const receivers = [...ids];
    shuffle(receivers);
    const assignment = tryAssignment(ids, receivers, blocked);
    if (assignment) return assignment;
  }

  return null;
}

function tryAssignment(
  givers: string[],
  receivers: string[],
  blocked: Set<string>,
): Map<string, string> | null {
  for (let i = 0; i < givers.length; i++) {
    const giver = givers[i]!;
    const receiver = receivers[i]!;
    if (giver === receiver || blocked.has(`${giver}:${receiver}`)) {
      return null;
    }
  }
  const assignment = new Map<string, string>();
  for (let i = 0; i < givers.length; i++) {
    assignment.set(givers[i]!, receivers[i]!);
  }
  return assignment;
}

function exhaustiveSearch(
  ids: string[],
  blocked: Set<string>,
): Map<string, string> | null {
  const receivers = [...ids];
  return permute(receivers, 0, ids, blocked);
}

function permute(
  receivers: string[],
  start: number,
  givers: string[],
  blocked: Set<string>,
): Map<string, string> | null {
  if (start >= receivers.length) {
    return tryAssignment(givers, receivers, blocked);
  }
  for (let i = start; i < receivers.length; i++) {
    [receivers[start], receivers[i]] = [receivers[i]!, receivers[start]!];
    const result = permute(receivers, start + 1, givers, blocked);
    if (result) return result;
    [receivers[start], receivers[i]] = [receivers[i]!, receivers[start]!];
  }
  return null;
}

export function isMatchingPossible(
  participants: MatchParticipant[],
  blackoutPairs: Array<[string, string]>,
): boolean {
  return findDerangementWithBlackouts(participants, blackoutPairs) !== null;
}

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}
