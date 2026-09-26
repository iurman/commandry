export type SyntheticRunState = "queued" | "running" | "succeeded" | "failed";

export interface SyntheticRun {
  id: string;
  occurrenceId: string;
  state: SyntheticRunState;
  attempts: number;
  result: string | null;
  error: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

/** An occurrence ID identifies one intended run across retries and replicas. */
export function syntheticOccurrenceId(key: string): string {
  const normalized = key.trim();
  if (normalized.length < 1 || normalized.length > 180) {
    throw new RangeError("Synthetic run key must contain 1 to 180 characters");
  }
  return `synthetic:v1:${normalized}`;
}

/** The synthetic effect is deterministic and contains no external side effect. */
export function syntheticResult(occurrenceId: string): string {
  return `Processed ${occurrenceId}`;
}
