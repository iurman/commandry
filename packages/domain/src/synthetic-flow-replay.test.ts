import { describe, expect, it } from "vitest";
import {
  buildSyntheticFlowReplay,
  type SyntheticReplayInput,
} from "./synthetic-flow-replay";

const input: SyntheticReplayInput = {
  import: {
    id: "import-1",
    projectId: "project-1",
    scenarioId: "operations.monitor-down",
    state: "succeeded",
    error: null,
    createdAt: "2026-09-27T12:00:00.000Z",
    completedAt: "2026-09-27T12:00:04.000Z",
  },
  envelope: {
    id: "envelope-1",
    sourceLabel: "Synthetic operational fixture",
    occurredAt: "2026-09-27T11:55:00.000Z",
    receivedAt: "2026-09-27T12:00:00.500Z",
  },
  attempts: [
    {
      id: "attempt-1",
      state: "succeeded",
      startedAt: "2026-09-27T12:00:01.000Z",
      completedAt: "2026-09-27T12:00:04.000Z",
    },
  ],
  event: {
    id: "event-1",
    type: "monitor.down",
    summary: "Fixture service down",
    occurredAt: "2026-09-27T11:55:00.000Z",
    ingestedAt: "2026-09-27T12:00:02.000Z",
  },
  metric: {
    id: "metric-1",
    name: "external_availability",
    value: 0,
    unit: "percent",
    sampledAt: "2026-09-27T11:55:00.000Z",
    recordedAt: "2026-09-27T12:00:02.000Z",
  },
  alertEvidence: [
    {
      id: "alert-evidence-1",
      alertId: "alert-1",
      recordedAt: "2026-09-27T12:00:03.000Z",
    },
  ],
  automationRuns: [
    {
      id: "run-1",
      definitionId: "definition-1",
      state: "succeeded",
      createdAt: "2026-09-27T12:00:05.000Z",
    },
  ],
  nextCursor: null,
};

describe("synthetic flow replay", () => {
  it("sorts persisted stages by recording time and preserves source occurrence separately", () => {
    const replay = buildSyntheticFlowReplay(input, "2026-09-27T12:01:00.000Z");
    expect(replay.mode).toBe("historical_replay");
    expect(replay.isSynthetic).toBe(true);
    expect(replay.stages.map((stage) => stage.kind)).toEqual([
      "import_queued",
      "source_received",
      "attempt_started",
      "event_projected",
      "metric_projected",
      "alert_evidence",
      "attempt_completed",
      "import_completed",
      "automation_queued",
    ]);
    expect(replay.stages.every((stage) => stage.isSynthetic)).toBe(true);
    expect(replay.stages[1]).toMatchObject({
      occurredAt: "2026-09-27T11:55:00.000Z",
      href: "/api/v1/source-envelopes/envelope-1",
    });
    expect(replay.stages.at(-1)?.detail).toContain(
      "stored state when replay was generated",
    );
  });

  it("shows a failed import without inventing downstream records", () => {
    const replay = buildSyntheticFlowReplay(
      {
        ...input,
        import: {
          ...input.import,
          state: "failed",
          error: "Projection failed",
        },
        event: null,
        metric: null,
        alertEvidence: [],
        automationRuns: [],
      },
      "2026-09-27T12:01:00.000Z",
    );
    expect(
      replay.stages.some((stage) => stage.kind === "event_projected"),
    ).toBe(false);
    expect(replay.stages.at(-1)?.detail).toContain("Projection failed");
  });
});
