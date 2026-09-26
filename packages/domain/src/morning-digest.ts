export type MorningRunKind = "automation" | "agent";
export type MorningRunState = "succeeded" | "failed" | "skipped";

export class MorningDigestError extends Error {
  constructor(
    readonly code: "INVALID_WINDOW" | "INVALID_CURSOR",
    message: string,
  ) {
    super(message);
    this.name = "MorningDigestError";
  }
}

export function morningDigestWindow(from: string, to: string) {
  const start = new Date(from);
  const end = new Date(to);
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    start >= end ||
    end.getTime() - start.getTime() > 31 * 24 * 60 * 60_000
  )
    throw new MorningDigestError(
      "INVALID_WINDOW",
      "Choose a UTC window longer than zero and no wider than 31 days",
    );
  return { from: start, to: end };
}

export function morningDigestOutcome(state: MorningRunState) {
  return state === "succeeded"
    ? ("awaiting_review" as const)
    : state === "failed"
      ? ("failed" as const)
      : ("skipped" as const);
}

export function morningDigestCursor(input: {
  completedAt: Date;
  kind: MorningRunKind;
  id: string;
}) {
  return `${input.completedAt.toISOString()}|${input.kind}|${input.id}`;
}

export function parseMorningDigestCursor(cursor: string | undefined) {
  if (!cursor) return null;
  const match =
    /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z)\|(automation|agent)\|([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.exec(
      cursor,
    );
  const completedAt = match ? new Date(match[1]!) : null;
  if (!match || !completedAt || !Number.isFinite(completedAt.getTime()))
    throw new MorningDigestError(
      "INVALID_CURSOR",
      "Morning digest cursor is invalid",
    );
  return {
    completedAt,
    kind: match[2] as MorningRunKind,
    id: match[3]!,
  };
}
