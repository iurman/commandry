export const LOCAL_PROJECT_SUMMARY_POLICY = {
  routine: "local_project_summary_v1",
  triggerType: "on_creation_once",
  optionalManualSchedule: "one_time_utc",
  optionalRecurrence: "bounded_utc_interval",
  optionalSyntheticEvent: "project_scoped_synthetic_event",
  optionalSyntheticCondition: "resource_scoped_synthetic_metric_threshold",
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

export const LOCAL_PROJECT_NOTE_ACTION_POLICY = {
  kind: "create_project_note",
  capabilityReference: "commandry.project.knowledge.create",
  risk: "reversible",
  approvalBehavior: "definition_opt_in_local_only",
  auditOperation: "automation.local_note_created",
  externalActions: false,
} as const;

export function localAutomationNote(input: {
  runId: string;
  definitionId: string;
  definitionName: string;
  summary: string;
  evidenceHrefs: string[];
}) {
  const shown = input.evidenceHrefs.slice(0, 20);
  return {
    title: `Synthetic automation summary: ${input.definitionName}`,
    content: [
      "Synthetic local automation note. This is generated content, not a live source report.",
      `Run: ${input.runId}`,
      `Review: /automations/${input.definitionId}`,
      "",
      input.summary.slice(0, 1500),
      "",
      `Evidence references (${shown.length} of ${input.evidenceHrefs.length}; review the run for the complete set):`,
      ...shown,
      "",
      "Created only in Commandry. No external action or real-world verification occurred.",
    ].join("\n"),
  };
}

export type LocalAutomationErrorCode =
  | "PROJECT_NOT_FOUND"
  | "AUTOMATION_NOT_FOUND"
  | "AUTOMATION_DISABLED"
  | "AUTOMATION_STALE"
  | "AUTOMATION_OCCURRENCE_CONFLICT"
  | "AUTOMATION_RUN_NOT_FOUND"
  | "AUTOMATION_RUN_NOT_READY"
  | "AUTOMATION_INVALID_SCHEDULE"
  | "AUTOMATION_INVALID_CONDITION";

export const LOCAL_AUTOMATION_EVENT_TYPES = [
  "git.pull_request.merged",
  "monitor.down",
  "monitor.recovered",
] as const;

export type LocalAutomationEventType =
  (typeof LOCAL_AUTOMATION_EVENT_TYPES)[number];

export function localAutomationTrigger(input: {
  recurrence?: { startAt: string; everyMinutes: number } | undefined;
  eventType?: LocalAutomationEventType | undefined;
  condition?: { resourceId: string; thresholdPercent: number } | undefined;
}) {
  if (
    Number(Boolean(input.recurrence)) +
      Number(Boolean(input.eventType)) +
      Number(Boolean(input.condition)) >
    1
  )
    throw new LocalAutomationError(
      "AUTOMATION_INVALID_CONDITION",
      "Choose only one trigger: recurring interval, synthetic event, or synthetic condition",
    );
  return input.condition
    ? "synthetic_condition"
    : input.eventType
      ? "synthetic_event"
      : input.recurrence
        ? "recurring_interval"
        : "on_creation_once";
}

export function syntheticConditionAutomationDecision(
  definition: {
    projectId: string;
    triggerType: string;
    conditionResourceId: string | null;
    conditionThresholdPercent: number | null;
    createdAt: Date;
    enabled: boolean;
  },
  sample: {
    projectId: string;
    resourceId: string;
    name: string;
    unit: string;
    value: number;
    isSynthetic: boolean;
    sourceKind: string;
    recordedAt: Date;
  },
  previousValue: number | null,
  isLatest: boolean,
  hasActiveRun: boolean,
): "ineligible" | "queue" | "skip_disabled" | "skip_overlap" {
  const threshold = definition.conditionThresholdPercent;
  if (
    definition.triggerType !== "synthetic_condition" ||
    definition.projectId !== sample.projectId ||
    definition.conditionResourceId !== sample.resourceId ||
    threshold === null ||
    threshold < 0 ||
    threshold > 99 ||
    definition.createdAt > sample.recordedAt ||
    sample.name !== "external_availability" ||
    sample.unit !== "percent" ||
    sample.sourceKind !== "synthetic-operations" ||
    !sample.isSynthetic ||
    !isLatest ||
    sample.value > threshold ||
    (previousValue !== null && previousValue <= threshold)
  )
    return "ineligible";
  if (!definition.enabled) return "skip_disabled";
  return hasActiveRun ? "skip_overlap" : "queue";
}

export function syntheticEventAutomationDecision(
  definition: {
    projectId: string;
    triggerType: string;
    eventType: string | null;
    createdAt: Date;
    enabled: boolean;
  },
  event: { projectId: string; type: string; ingestedAt: Date },
  hasActiveRun: boolean,
): "ineligible" | "queue" | "skip_disabled" | "skip_overlap" {
  if (
    definition.triggerType !== "synthetic_event" ||
    definition.projectId !== event.projectId ||
    definition.eventType !== event.type ||
    definition.createdAt > event.ingestedAt
  )
    return "ineligible";
  if (!definition.enabled) return "skip_disabled";
  return hasActiveRun ? "skip_overlap" : "queue";
}

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
