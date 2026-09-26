export const LOCAL_PROJECT_SUMMARY_POLICY = {
  routine: "local_project_summary_v1",
  triggerType: "on_creation_once",
  optionalManualSchedule: "one_time_utc",
  optionalRecurrence: "bounded_utc_interval",
  sourceOfTruth: "local-only",
  risk: "read_only",
  requiredCapability: "project.brief.read",
  approval: "not_required",
  externalActions: false,
  auditOperations: [
    "automation.created",
    "automation.enabled_changed",
    "automation.run_queued",
    "automation.occurrences_skipped",
    "automation.attempt_started",
    "automation.project_brief_read",
    "automation.run_succeeded",
    "automation.run_skipped",
    "automation.attempt_failed",
  ],
} as const;

export type LocalAutomationErrorCode =
  | "PROJECT_NOT_FOUND"
  | "AUTOMATION_NOT_FOUND"
  | "AUTOMATION_DISABLED"
  | "AUTOMATION_STALE"
  | "AUTOMATION_OCCURRENCE_CONFLICT"
  | "AUTOMATION_RUN_NOT_FOUND"
  | "AUTOMATION_INVALID_SCHEDULE";

export class LocalAutomationError extends Error {
  constructor(
    readonly code: LocalAutomationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LocalAutomationError";
  }
}

export function requireAutomationEnabled(enabled: boolean) {
  if (!enabled)
    throw new LocalAutomationError(
      "AUTOMATION_DISABLED",
      "Enable this local automation before running it",
    );
}

export function scheduledAutomationTime(
  scheduledFor: string | undefined,
  now: Date,
): Date | null {
  if (!scheduledFor) return null;
  const scheduled = new Date(scheduledFor);
  if (!Number.isFinite(scheduled.getTime()) || scheduled <= now)
    throw new LocalAutomationError(
      "AUTOMATION_INVALID_SCHEDULE",
      "Schedule must be a future time with an explicit UTC offset",
    );
  return scheduled;
}

export function recurringAutomationStart(
  recurrence: { startAt: string; everyMinutes: number } | undefined,
  now: Date,
): { startAt: Date; everyMinutes: number } | null {
  if (!recurrence) return null;
  const startAt = new Date(recurrence.startAt);
  if (
    !Number.isFinite(startAt.getTime()) ||
    startAt <= now ||
    !Number.isInteger(recurrence.everyMinutes) ||
    recurrence.everyMinutes < 5 ||
    recurrence.everyMinutes > 10_080
  )
    throw new LocalAutomationError(
      "AUTOMATION_INVALID_SCHEDULE",
      "Recurring start must be in the future and interval must be 5 to 10080 minutes",
    );
  return { startAt, everyMinutes: recurrence.everyMinutes };
}

export function firstRecurrenceAfter(
  startAt: Date,
  everyMinutes: number,
  now: Date,
): Date {
  const interval = everyMinutes * 60_000;
  const steps = Math.max(
    0,
    Math.floor((now.getTime() - startAt.getTime()) / interval) + 1,
  );
  return new Date(startAt.getTime() + steps * interval);
}

export function dueRecurrence(
  nextAt: Date,
  everyMinutes: number,
  now: Date,
): { dueAt: Date; nextAt: Date; skipped: number } | null {
  if (nextAt > now) return null;
  const interval = everyMinutes * 60_000;
  const skipped = Math.floor((now.getTime() - nextAt.getTime()) / interval);
  const dueAt = new Date(nextAt.getTime() + skipped * interval);
  return { dueAt, nextAt: new Date(dueAt.getTime() + interval), skipped };
}

export function requireSameAutomationOccurrence(
  existing: { definitionId: string; scheduledFor: Date | null },
  definitionId: string,
  scheduledFor: string | undefined,
) {
  const requestedTime = scheduledFor ? Date.parse(scheduledFor) : null;
  if (
    existing.definitionId !== definitionId ||
    (existing.scheduledFor?.getTime() ?? null) !== requestedTime
  )
    throw new LocalAutomationError(
      "AUTOMATION_OCCURRENCE_CONFLICT",
      "Occurrence was already used for a different automation or due time",
    );
}

export function requireExpectedAutomationEnabled(
  current: boolean,
  expected: boolean,
  next: boolean,
) {
  if (current !== expected || current === next)
    throw new LocalAutomationError(
      "AUTOMATION_STALE",
      "Automation enabled state changed; reload before editing",
    );
}
