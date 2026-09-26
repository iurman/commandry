export const LOCAL_PROJECT_SUMMARY_POLICY = {
  routine: "local_project_summary_v1",
  triggerType: "on_creation_once",
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
  | "AUTOMATION_RUN_NOT_FOUND";

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
