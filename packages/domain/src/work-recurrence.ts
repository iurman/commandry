import { dueRecurrence, firstRecurrenceAfter } from "./local-automation";

export const LOCAL_WORK_RECURRENCE_POLICY = {
  sourceOfTruth: "local-only",
  risk: "routine",
  requiredCapability: "work.create",
  approval: "not_required_for_local_task_creation",
  externalActions: false,
  generatedAssignee: "unassigned",
  catchUp: "latest_due_only",
  auditOperations: [
    "work.recurrence.created",
    "work.recurrence.updated",
    "work.recurrence.occurrence_queued",
    "work.recurrence.occurrences_skipped",
    "work.recurrence.attempt_started",
    "work.recurrence.occurrence_generated",
    "work.recurrence.attempt_failed",
  ],
} as const;

export class WorkRecurrenceError extends Error {
  constructor(
    public readonly code:
      | "WORK_ITEM_NOT_FOUND"
      | "RECURRENCE_NOT_FOUND"
      | "RECURRENCE_ALREADY_EXISTS"
      | "RECURRENCE_INVALID_SOURCE"
      | "RECURRENCE_INVALID_SCHEDULE"
      | "RECURRENCE_CONFLICT",
    message: string,
  ) {
    super(message);
  }
}

export function requireWorkRecurrenceSource(source: {
  workType: string;
  generatedFromWorkItemId: string | null;
}) {
  if (source.workType !== "task" || source.generatedFromWorkItemId) {
    throw new WorkRecurrenceError(
      "RECURRENCE_INVALID_SOURCE",
      "Only an original local task can define recurring Work",
    );
  }
}

export function requireWorkRecurrenceSchedule(
  input: { startAt: string; everyMinutes: number },
  now: Date,
  allowPast = false,
): { startAt: Date; everyMinutes: number } {
  const startAt = new Date(input.startAt);
  if (
    !Number.isFinite(startAt.getTime()) ||
    (!allowPast && startAt <= now) ||
    !Number.isInteger(input.everyMinutes) ||
    input.everyMinutes < 5 ||
    input.everyMinutes > 10_080
  ) {
    throw new WorkRecurrenceError(
      "RECURRENCE_INVALID_SCHEDULE",
      "Start must be a future UTC time and interval must be 5 to 10080 minutes",
    );
  }
  return { startAt, everyMinutes: input.everyMinutes };
}

export function workRecurrenceDue(
  nextAt: Date,
  everyMinutes: number,
  now: Date,
) {
  return dueRecurrence(nextAt, everyMinutes, now);
}

export function firstWorkRecurrenceAfter(
  startAt: Date,
  everyMinutes: number,
  now: Date,
) {
  return firstRecurrenceAfter(startAt, everyMinutes, now);
}

export function generatedWorkDraft(
  source: {
    title: string;
    description: string;
    priority: "low" | "normal" | "high" | null;
    sourceCaptureId: string;
    projectId: string;
    id: string;
  },
  scheduledFor: Date,
) {
  return {
    projectId: source.projectId,
    sourceCaptureId: source.sourceCaptureId,
    generatedFromWorkItemId: source.id,
    title: source.title,
    description: source.description,
    workType: "task" as const,
    status: "open" as const,
    assigneeKind: "unassigned" as const,
    priority: source.priority,
    dueOn: scheduledFor.toISOString().slice(0, 10),
  };
}
