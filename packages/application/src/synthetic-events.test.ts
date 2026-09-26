import { describe, expect, it } from "vitest";
import type {
  SourceEnvelopeRecord,
  SyntheticAlert,
  SyntheticEventImportRecord,
} from "@commandry/contracts";
import {
  createSyntheticEventImportProcessor,
  createSyntheticEventImportService,
  createSyntheticEventReadService,
  normalizeSyntheticEnvelope,
  prepareSyntheticEventImport,
} from "./synthetic-events";

const projectId = "2bb13be7-1e04-493c-9776-781021b0c242";
const resourceId = "3f363235-74aa-4f80-a0df-d77750e70ae3";
const envelope: SourceEnvelopeRecord = {
  id: "ae81eac3-1346-4b8e-9979-b3b8ae9f04ac",
  importId: "4b3a3e7e-a02f-40e3-abef-0d7bb00ad8e0",
  sourceKind: "synthetic-operations",
  sourceLabel: "Synthetic operational fixture",
  sourceSchemaVersion: "synthetic-fixture/v1",
  sourceEventId: "unit:down",
  rawPayload: {
    scenarioId: "operations.monitor-down",
    projectId,
    resourceId,
    occurrenceId: "unit:down",
    occurredAt: null,
  },
  occurredAt: "2026-09-25T10:00:00.000Z",
  receivedAt: "2026-09-25T10:00:01.000Z",
  isSynthetic: true,
};
const run: SyntheticEventImportRecord = {
  id: envelope.importId,
  occurrenceId: envelope.sourceEventId,
  scenarioId: "operations.monitor-down",
  projectId,
  resourceId,
  sourceKind: envelope.sourceKind,
  sourceLabel: envelope.sourceLabel,
  isSynthetic: true,
  state: "queued",
  attempts: 0,
  error: null,
  sourceEnvelopeId: envelope.id,
  eventId: null,
  occurredAt: envelope.occurredAt,
  receivedAt: envelope.receivedAt,
  createdAt: envelope.receivedAt,
  completedAt: null,
};

describe("synthetic event application", () => {
  it("prepares fixed labeled evidence with a stable request fingerprint", () => {
    const input = {
      scenarioId: "operations.monitor-down" as const,
      projectId,
      resourceId,
      occurrenceId: "unit:down",
    };
    const first = prepareSyntheticEventImport(input);
    expect(prepareSyntheticEventImport(input)).toEqual(first);
    expect(first.rawPayload).toMatchObject({
      scenarioId: input.scenarioId,
      occurrenceId: input.occurrenceId,
    });
    expect(first.sourceLabel).toBe("Synthetic operational fixture");
    expect(first.occurredAt).toBeNull();
    expect(
      prepareSyntheticEventImport({
        ...input,
        scenarioId: "operations.monitor-recovered",
      }).requestFingerprint,
    ).not.toBe(first.requestFingerprint);
  });

  it("requires an existing project and linked resource before submission", async () => {
    let writes = 0;
    const port = {
      projectExists: async () => true,
      resourceExists: async () => true,
      resourceLinkedToProject: async () => false,
      submitOnce: async () => {
        writes += 1;
        return run;
      },
      getById: async () => run,
      list: async () => ({ items: [run], nextCursor: null }),
    };
    await expect(
      createSyntheticEventImportService(port).submit({
        scenarioId: "operations.monitor-down",
        projectId,
        resourceId,
        occurrenceId: "unit:down",
      }),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_LINKED" });
    expect(writes).toBe(0);
  });

  it("rejects a mismatched projection and records a failed attempt", async () => {
    let failed = 0;
    let completed = 0;
    const processor = createSyntheticEventImportProcessor(
      {
        getById: async () => run,
        beginAttempt: async () => "attempt-1",
        getSourceEnvelope: async () => envelope,
        completeProjection: async () => {
          completed += 1;
          return run;
        },
        failAttempt: async () => {
          failed += 1;
        },
      },
      async (source) => ({
        ...normalizeSyntheticEnvelope(source),
        type: "monitor.recovered",
      }),
    );
    await expect(
      processor({ version: 1, runId: run.id, occurrenceId: run.occurrenceId }),
    ).rejects.toThrow(/target does not match/);
    expect(failed).toBe(1);
    expect(completed).toBe(0);
  });

  it("maps only open alerts to evidence-linked attention", async () => {
    const alert: SyntheticAlert = {
      id: "fb66cdec-a2ca-4709-9df6-80ac8dce17a2",
      state: "open",
      severity: "critical",
      ruleId: "synthetic.monitor.availability.v1",
      reason:
        "Synthetic monitor-down evidence opened this local attention condition.",
      projectId,
      resourceId,
      firstObservedAt: envelope.occurredAt,
      lastObservedAt: envelope.occurredAt,
      resolvedAt: null,
      lastEventId: "70b5a775-84c8-4faf-a0c5-7dd57ab884b6",
      evidenceEventIds: ["70b5a775-84c8-4faf-a0c5-7dd57ab884b6"],
      sourceKind: "synthetic-operations",
      sourceLabel: "Synthetic operational fixture",
      isSynthetic: true,
    };
    const service = createSyntheticEventReadService({
      getById: async () => run,
      list: async () => ({ items: [run], nextCursor: null }),
      getEventById: async () => null,
      listEvents: async () => ({ items: [], nextCursor: null }),
      getAlertById: async () => alert,
      listAlerts: async (query) => {
        expect(query.state).toBe("open");
        expect(query.projectId).toBe(projectId);
        return { items: [alert], nextCursor: null };
      },
      getSourceEnvelopeById: async () => envelope,
    });
    const page = await service.listAttention({ limit: 1, projectId });
    expect(page.items[0]).toMatchObject({
      alertId: alert.id,
      evidenceHref: `/api/v1/events/${alert.lastEventId}`,
      isSynthetic: true,
    });
  });
});
