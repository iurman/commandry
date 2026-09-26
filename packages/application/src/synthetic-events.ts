import { createHash } from "node:crypto";
import {
  syntheticEventImportJobV1Schema,
  type CreateSyntheticEventImportRequest,
  type NormalizedSyntheticEvent,
  type SourceEnvelopeRecord,
  type SyntheticAlert,
  type SyntheticEventImportJobV1,
  type SyntheticEventImportRecord,
  type SyntheticMetricSample,
} from "@commandry/contracts";
import {
  decideSyntheticMonitorAlert,
  SYNTHETIC_EVENT_PROCESSING_VERSION,
  SYNTHETIC_EVENT_SOURCE_VERSION,
  syntheticScenario,
  SyntheticEventBindingError,
  type SyntheticEventType,
  type SyntheticMonitorAlertState,
  type SyntheticScenarioId,
} from "@commandry/domain";

export type PreparedSyntheticEventImport = {
  occurrenceId: string;
  requestFingerprint: string;
  scenarioId: SyntheticScenarioId;
  projectId: string;
  resourceId: string | null;
  sourceKind: "synthetic-development" | "synthetic-operations";
  sourceLabel:
    "Synthetic development fixture" | "Synthetic operational fixture";
  sourceEventId: string;
  sourceSchemaVersion: typeof SYNTHETIC_EVENT_SOURCE_VERSION;
  occurredAt: string | null;
  rawPayload: Record<string, string | null>;
};

export type EventPageQuery = {
  limit: number;
  cursor?: string | undefined;
  projectId?: string | undefined;
  resourceId?: string | undefined;
};

export type SyntheticEventPage<T> = {
  items: T[];
  nextCursor: string | null;
};

export function prepareSyntheticEventImport(
  input: CreateSyntheticEventImportRequest,
): PreparedSyntheticEventImport {
  const scenario = syntheticScenario(input.scenarioId);
  if (scenario.requiresResource && !input.resourceId) {
    throw new SyntheticEventBindingError(
      "RESOURCE_REQUIRED",
      "This synthetic scenario requires a linked resource",
    );
  }
  const occurredAt = input.occurredAt ?? null;
  const resourceId = input.resourceId ?? null;
  const fingerprintPayload = {
    scenarioId: input.scenarioId,
    projectId: input.projectId,
    resourceId,
    occurredAt,
  };
  const requestFingerprint = createHash("sha256")
    .update(JSON.stringify(fingerprintPayload))
    .digest("hex");
  return {
    occurrenceId: input.occurrenceId,
    requestFingerprint,
    scenarioId: input.scenarioId,
    projectId: input.projectId,
    resourceId,
    sourceKind: scenario.sourceKind,
    sourceLabel: scenario.sourceLabel,
    sourceEventId: input.occurrenceId,
    sourceSchemaVersion: SYNTHETIC_EVENT_SOURCE_VERSION,
    occurredAt,
    rawPayload: {
      scenarioId: input.scenarioId,
      projectId: input.projectId,
      resourceId,
      occurrenceId: input.occurrenceId,
      occurredAt,
    },
  };
}

export interface SyntheticEventImportSubmissionPort {
  projectExists(projectId: string): Promise<boolean>;
  resourceExists(resourceId: string): Promise<boolean>;
  resourceLinkedToProject(
    resourceId: string,
    projectId: string,
  ): Promise<boolean>;
  submitOnce(
    input: PreparedSyntheticEventImport,
  ): Promise<SyntheticEventImportRecord>;
  getById(id: string): Promise<SyntheticEventImportRecord | null>;
  list(input: {
    limit: number;
    cursor?: string | undefined;
  }): Promise<SyntheticEventPage<SyntheticEventImportRecord>>;
}

export function createSyntheticEventImportService(
  port: SyntheticEventImportSubmissionPort,
) {
  return {
    async submit(input: CreateSyntheticEventImportRequest) {
      const prepared = prepareSyntheticEventImport(input);
      if (!(await port.projectExists(prepared.projectId))) {
        throw new SyntheticEventBindingError(
          "PROJECT_NOT_FOUND",
          "Project not found",
        );
      }
      if (prepared.resourceId) {
        if (!(await port.resourceExists(prepared.resourceId))) {
          throw new SyntheticEventBindingError(
            "RESOURCE_NOT_FOUND",
            "Resource not found",
          );
        }
        if (
          !(await port.resourceLinkedToProject(
            prepared.resourceId,
            prepared.projectId,
          ))
        ) {
          throw new SyntheticEventBindingError(
            "RESOURCE_NOT_LINKED",
            "Resource is not linked to this project",
          );
        }
      }
      return port.submitOnce(prepared);
    },
    getById(id: string) {
      return port.getById(id);
    },
    list(input: { limit: number; cursor?: string | undefined }) {
      return port.list(input);
    },
  };
}

export type NormalizedSyntheticProjection = {
  type: SyntheticEventType;
  projectId: string;
  resourceId: string | null;
  sourceEnvelopeId: string;
  sourceKind: "synthetic-development" | "synthetic-operations";
  sourceLabel:
    "Synthetic development fixture" | "Synthetic operational fixture";
  severity: "info" | "critical";
  summary: string;
  occurredAt: string;
  processingVersion: typeof SYNTHETIC_EVENT_PROCESSING_VERSION;
};

export function normalizeSyntheticEnvelope(
  envelope: SourceEnvelopeRecord,
): NormalizedSyntheticProjection {
  if (
    !envelope.isSynthetic ||
    envelope.sourceSchemaVersion !== SYNTHETIC_EVENT_SOURCE_VERSION
  ) {
    throw new Error("Unsupported synthetic source envelope");
  }
  const scenarioId = envelope.rawPayload.scenarioId;
  if (!scenarioId) throw new Error("Synthetic envelope has no scenario");
  const scenario = syntheticScenario(scenarioId);
  if (
    scenario.sourceKind !== envelope.sourceKind ||
    scenario.sourceLabel !== envelope.sourceLabel
  ) {
    throw new Error("Synthetic source label does not match scenario");
  }
  const projectId = envelope.rawPayload.projectId;
  if (!projectId) throw new Error("Synthetic envelope has no project");
  const resourceId = envelope.rawPayload.resourceId ?? null;
  if (scenario.requiresResource && !resourceId) {
    throw new Error("Synthetic operational envelope has no resource");
  }
  return {
    type: scenario.eventType,
    projectId,
    resourceId,
    sourceEnvelopeId: envelope.id,
    sourceKind: scenario.sourceKind,
    sourceLabel: scenario.sourceLabel,
    severity: scenario.severity,
    summary: scenario.summary,
    occurredAt: envelope.occurredAt,
    processingVersion: SYNTHETIC_EVENT_PROCESSING_VERSION,
  };
}

export interface SyntheticEventImportProcessingPort {
  getById(id: string): Promise<SyntheticEventImportRecord | null>;
  beginAttempt(id: string): Promise<string | null>;
  getSourceEnvelope(importId: string): Promise<SourceEnvelopeRecord | null>;
  completeProjection(
    importId: string,
    attemptId: string,
    projection: NormalizedSyntheticProjection,
    decideAlert: typeof decideSyntheticMonitorAlert,
  ): Promise<SyntheticEventImportRecord>;
  failAttempt(importId: string, attemptId: string): Promise<void>;
}

export function createSyntheticEventImportProcessor(
  port: SyntheticEventImportProcessingPort,
  normalize: (
    envelope: SourceEnvelopeRecord,
  ) =>
    | NormalizedSyntheticProjection
    | Promise<NormalizedSyntheticProjection> = normalizeSyntheticEnvelope,
) {
  return async (input: SyntheticEventImportJobV1) => {
    const job = syntheticEventImportJobV1Schema.parse(input);
    const run = await port.getById(job.runId);
    if (!run || run.occurrenceId !== job.occurrenceId) {
      throw new Error("Synthetic event job does not match an import");
    }
    const attemptId = await port.beginAttempt(run.id);
    if (!attemptId) {
      const finished = await port.getById(run.id);
      if (!finished) throw new Error("Synthetic event import disappeared");
      return finished;
    }
    try {
      const envelope = await port.getSourceEnvelope(run.id);
      if (!envelope || envelope.id !== run.sourceEnvelopeId) {
        throw new Error("Synthetic source envelope is missing");
      }
      const projection = await normalize(envelope);
      if (
        projection.projectId !== run.projectId ||
        projection.resourceId !== run.resourceId ||
        projection.type !== syntheticScenario(run.scenarioId).eventType ||
        projection.sourceKind !== run.sourceKind ||
        projection.sourceLabel !== run.sourceLabel ||
        projection.occurredAt !== run.occurredAt
      ) {
        throw new Error("Synthetic projection target does not match import");
      }
      return await port.completeProjection(
        run.id,
        attemptId,
        projection,
        decideSyntheticMonitorAlert,
      );
    } catch (error) {
      await port.failAttempt(run.id, attemptId);
      throw error;
    }
  };
}

export type SyntheticAlertDecision = typeof decideSyntheticMonitorAlert;
export type SyntheticAlertState = SyntheticMonitorAlertState;

export interface SyntheticEventReadPort {
  getById(id: string): Promise<SyntheticEventImportRecord | null>;
  list(input: {
    limit: number;
    cursor?: string | undefined;
  }): Promise<SyntheticEventPage<SyntheticEventImportRecord>>;
  getEventById(id: string): Promise<NormalizedSyntheticEvent | null>;
  listEvents(
    input: EventPageQuery,
  ): Promise<SyntheticEventPage<NormalizedSyntheticEvent>>;
  listMetrics(
    input: EventPageQuery,
  ): Promise<SyntheticEventPage<SyntheticMetricSample>>;
  getAlertById(id: string): Promise<SyntheticAlert | null>;
  listAlerts(
    input: EventPageQuery & { state?: "open" | "resolved" | undefined },
  ): Promise<SyntheticEventPage<SyntheticAlert>>;
  getSourceEnvelopeById(id: string): Promise<SourceEnvelopeRecord | null>;
}

export function createSyntheticEventReadService(port: SyntheticEventReadPort) {
  return {
    getImportById: port.getById,
    listImports: port.list,
    getEventById: port.getEventById,
    listEvents: port.listEvents,
    listMetrics: port.listMetrics,
    getAlertById: port.getAlertById,
    listAlerts: port.listAlerts,
    getSourceEnvelopeById: port.getSourceEnvelopeById,
    async listAttention(input: {
      limit: number;
      cursor?: string | undefined;
      projectId?: string | undefined;
    }) {
      const page = await port.listAlerts({ ...input, state: "open" });
      return {
        items: page.items.map((alert) => ({
          id: alert.id,
          priority: "critical" as const,
          title: "Synthetic monitor needs attention",
          reason: alert.reason,
          ruleId: alert.ruleId,
          alertId: alert.id,
          projectId: alert.projectId,
          resourceId: alert.resourceId,
          lastObservedAt: alert.lastObservedAt,
          evidenceEventIds: alert.evidenceEventIds,
          evidenceHref: `/api/v1/events/${alert.lastEventId}`,
          sourceLabel: alert.sourceLabel,
          isSynthetic: true as const,
        })),
        nextCursor: page.nextCursor,
      };
    },
  };
}
