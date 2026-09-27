export type SyntheticReplayStageKind =
  | "import_queued"
  | "source_received"
  | "attempt_started"
  | "attempt_completed"
  | "event_projected"
  | "metric_projected"
  | "alert_evidence"
  | "import_completed"
  | "automation_queued";

export class SyntheticFlowReplayError extends Error {
  constructor(
    public readonly code: "REPLAY_CURSOR_INVALID",
    message: string,
  ) {
    super(message);
    this.name = "SyntheticFlowReplayError";
  }
}

export interface SyntheticReplayInput {
  import: {
    id: string;
    projectId: string;
    scenarioId:
      | "development.pr-merged"
      | "operations.monitor-down"
      | "operations.monitor-recovered";
    state: "queued" | "running" | "succeeded" | "failed";
    error: string | null;
    createdAt: string;
    completedAt: string | null;
  };
  envelope: {
    id: string;
    sourceLabel:
      "Synthetic development fixture" | "Synthetic operational fixture";
    occurredAt: string;
    receivedAt: string;
  };
  attempts: Array<{
    id: string;
    state: "running" | "succeeded" | "failed";
    startedAt: string;
    completedAt: string | null;
  }>;
  event: {
    id: string;
    type: string;
    summary: string;
    occurredAt: string;
    ingestedAt: string;
  } | null;
  metric: {
    id: string;
    name: string;
    value: number;
    unit: string;
    sampledAt: string;
    recordedAt: string;
  } | null;
  alertEvidence: Array<{
    id: string;
    alertId: string;
    recordedAt: string;
  }>;
  automationRuns: Array<{
    id: string;
    definitionId: string;
    state: "queued" | "running" | "succeeded" | "failed" | "skipped";
    createdAt: string;
  }>;
  nextCursor: string | null;
}

export interface SyntheticReplayStage {
  id: string;
  kind: SyntheticReplayStageKind;
  title: string;
  detail: string;
  recordedAt: string;
  occurredAt: string | null;
  href: string | null;
  isSynthetic: true;
}

const kindOrder: Record<SyntheticReplayStageKind, number> = {
  import_queued: 0,
  source_received: 1,
  attempt_started: 2,
  event_projected: 3,
  metric_projected: 4,
  alert_evidence: 5,
  attempt_completed: 6,
  import_completed: 7,
  automation_queued: 8,
};

export function buildSyntheticFlowReplay(
  input: SyntheticReplayInput,
  generatedAt: string,
) {
  const stages: SyntheticReplayStage[] = [];
  function add(stage: Omit<SyntheticReplayStage, "isSynthetic">) {
    stages.push({ ...stage, isSynthetic: true });
  }
  add({
    id: `import:${input.import.id}:queued`,
    kind: "import_queued",
    title: "Fixture import accepted",
    detail: "Commandry recorded a local synthetic import request.",
    recordedAt: input.import.createdAt,
    occurredAt: null,
    href: `/api/v1/synthetic-event-imports/${input.import.id}`,
  });
  add({
    id: `envelope:${input.envelope.id}`,
    kind: "source_received",
    title: "Original synthetic envelope retained",
    detail:
      "The exact fixture payload and its source occurrence time were stored.",
    recordedAt: input.envelope.receivedAt,
    occurredAt: input.envelope.occurredAt,
    href: `/api/v1/source-envelopes/${input.envelope.id}`,
  });
  for (const attempt of input.attempts) {
    add({
      id: `attempt:${attempt.id}:started`,
      kind: "attempt_started",
      title: "Worker attempt started",
      detail: "A recorded local worker attempt began processing this import.",
      recordedAt: attempt.startedAt,
      occurredAt: null,
      href: `/api/v1/synthetic-event-imports/${input.import.id}`,
    });
    if (attempt.completedAt)
      add({
        id: `attempt:${attempt.id}:completed`,
        kind: "attempt_completed",
        title: `Worker attempt ${attempt.state}`,
        detail:
          "This is the persisted attempt outcome, not a live worker status.",
        recordedAt: attempt.completedAt,
        occurredAt: null,
        href: `/api/v1/synthetic-event-imports/${input.import.id}`,
      });
  }
  if (input.event)
    add({
      id: `event:${input.event.id}`,
      kind: "event_projected",
      title: "Normalized synthetic event projected",
      detail: `${input.event.type}: ${input.event.summary}`,
      recordedAt: input.event.ingestedAt,
      occurredAt: input.event.occurredAt,
      href: `/api/v1/events/${input.event.id}`,
    });
  if (input.metric)
    add({
      id: `metric:${input.metric.id}`,
      kind: "metric_projected",
      title: "Synthetic metric sample projected",
      detail: `${input.metric.name}: ${input.metric.value} ${input.metric.unit}. This is fixture telemetry, not real resource health.`,
      recordedAt: input.metric.recordedAt,
      occurredAt: input.metric.sampledAt,
      href: `/api/v1/metrics/${input.metric.id}`,
    });
  for (const evidence of input.alertEvidence)
    add({
      id: `alert-evidence:${evidence.id}`,
      kind: "alert_evidence",
      title: "Synthetic alert evidence attached",
      detail:
        "This source event was linked to an alert. The alert's current state may have changed since this record.",
      recordedAt: evidence.recordedAt,
      occurredAt: null,
      href: `/api/v1/alerts/${evidence.alertId}`,
    });
  if (input.import.completedAt)
    add({
      id: `import:${input.import.id}:completed`,
      kind: "import_completed",
      title: `Import ${input.import.state}`,
      detail: input.import.error
        ? `The stored import outcome reports: ${input.import.error}`
        : "The worker recorded this import outcome.",
      recordedAt: input.import.completedAt,
      occurredAt: null,
      href: `/api/v1/synthetic-event-imports/${input.import.id}`,
    });
  for (const run of input.automationRuns)
    add({
      id: `automation-run:${run.id}`,
      kind: "automation_queued",
      title: "Linked local automation run",
      detail: `This run cites the normalized synthetic event. Its stored state when replay was generated was ${run.state}.`,
      recordedAt: run.createdAt,
      occurredAt: null,
      href: `/automations/${run.definitionId}`,
    });
  stages.sort(
    (left, right) =>
      left.recordedAt.localeCompare(right.recordedAt) ||
      kindOrder[left.kind] - kindOrder[right.kind] ||
      left.id.localeCompare(right.id),
  );
  return {
    mode: "historical_replay" as const,
    importId: input.import.id,
    projectId: input.import.projectId,
    scenarioId: input.import.scenarioId,
    importState: input.import.state,
    sourceLabel: input.envelope.sourceLabel,
    generatedAt,
    stages,
    nextCursor: input.nextCursor,
    isSynthetic: true as const,
  };
}
