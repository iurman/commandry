export const LOCAL_PROJECT_SUMMARY_POLICY = {
  routine: "local_project_summary_v1",
  triggerType: "on_creation_once",
  optionalManualSchedule: "one_time_utc",
  sourceOfTruth: "local-only",
  risk: "read_only",
  requiredCapability: "project.brief.read",
  approval: "not_required",
  externalActions: false,
  auditOperations: [
    "automation.created",
    "automation.enabled_changed",
    "automation.run_queued",
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
