export class OvernightQueueError extends Error {
  constructor(
    public readonly code:
      | "PACKET_NOT_FOUND"
      | "AGENT_NOT_FOUND"
      | "NOT_READY"
      | "INVALID_SCHEDULE"
      | "ENTRY_NOT_FOUND"
      | "NOT_CANCELABLE",
    message: string,
  ) {
    super(message);
    this.name = "OvernightQueueError";
  }
}

export function validateOvernightRunAfter(
  value: string,
  now: Date,
  maxDays: number,
): Date {
  const runAfter = new Date(value);
  if (
    !Number.isFinite(runAfter.getTime()) ||
    runAfter.getTime() <= now.getTime() ||
    runAfter.getTime() > now.getTime() + maxDays * 86_400_000
  ) {
    throw new OvernightQueueError(
      "INVALID_SCHEDULE",
      `Choose a future time within ${maxDays} days`,
    );
  }
  return runAfter;
}
