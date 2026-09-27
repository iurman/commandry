import {
  automationJobV1Schema,
  automationRunResultSchema,
  type AutomationAuditEvent,
  type AutomationDefinition,
  type AutomationJobV1,
  type AutomationRun,
  type AutomationRunAttempt,
  type AutomationRunResult,
  type CreateAutomationDefinitionRequest,
  type NormalizedSyntheticEvent,
  type ProjectBrief,
  type SetAutomationEnabledRequest,
  type SyntheticMetricSample,
  type TriggerAutomationRunRequest,
} from "@commandry/contracts";
import { LocalAutomationError } from "@commandry/domain";

type PageQuery = { limit: number; cursor?: string | undefined };

export interface LocalAutomationPort {
  createDefinition(
    input: CreateAutomationDefinitionRequest,
  ): Promise<AutomationDefinition>;
  setEnabled(
    id: string,
    input: SetAutomationEnabledRequest,
  ): Promise<AutomationDefinition>;
  triggerRun(
    id: string,
    input: TriggerAutomationRunRequest,
  ): Promise<AutomationRun>;
  getDefinition(id: string): Promise<AutomationDefinition | null>;
  listDefinitions(
    query: PageQuery & { projectId?: string | undefined },
  ): Promise<{ items: AutomationDefinition[]; nextCursor: string | null }>;
  getRun(id: string): Promise<AutomationRun | null>;
  listRuns(
    definitionId: string,
    query: PageQuery,
  ): Promise<{ items: AutomationRun[]; nextCursor: string | null }>;
  listAttempts(
    runId: string,
    query: PageQuery,
  ): Promise<{ items: AutomationRunAttempt[]; nextCursor: string | null }>;
  listAudit(
    definitionId: string,
    query: PageQuery,
  ): Promise<{ items: AutomationAuditEvent[]; nextCursor: string | null }>;
}

export function createLocalAutomationService(port: LocalAutomationPort) {
  return {
    createDefinition: port.createDefinition,
    setEnabled: port.setEnabled,
    triggerRun: port.triggerRun,
    getDefinition: port.getDefinition,
    listDefinitions: port.listDefinitions,
    getRun: port.getRun,
    listRuns: port.listRuns,
    listAttempts: port.listAttempts,
    listAudit: port.listAudit,
  };
}

export function buildLocalProjectSummaryResult(
  brief: ProjectBrief,
  sourceEvent: NormalizedSyntheticEvent | null = null,
  sourceMetric: SyntheticMetricSample | null = null,
  thresholdPercent: number | null = null,
): AutomationRunResult {
  const work = brief.sections.work;
  const decisions = brief.sections.decisions;
  const attention = brief.sections.attention;
  const evidence = [
    ...(sourceEvent
      ? [
          {
            kind: "event" as const,
            id: sourceEvent.id,
            href: `/api/v1/events/${sourceEvent.id}`,
            recordedAt: sourceEvent.ingestedAt,
            occurredAt: sourceEvent.occurredAt,
            sourceLabel: sourceEvent.sourceLabel,
            isSynthetic: true,
          },
        ]
      : []),
    ...(sourceMetric
      ? [
          {
            kind: "metric_sample" as const,
            id: sourceMetric.id,
            href: `/api/v1/metrics/${sourceMetric.id}`,
            recordedAt: sourceMetric.recordedAt,
            occurredAt: sourceMetric.sampledAt,
            sourceLabel: sourceMetric.sourceLabel,
            isSynthetic: true,
          },
        ]
      : []),
    ...brief.state.evidence,
    ...work.items.flatMap((item) => item.evidence),
    ...decisions.items.flatMap((item) => item.evidence),
    ...attention.items.flatMap((item) => item.evidence),
  ];
  const distinctEvidence = Array.from(
    new Map(evidence.map((item) => [`${item.kind}:${item.id}`, item])).values(),
  );
  return automationRunResultSchema.parse({
    summary: `${sourceMetric ? `Synthetic ${sourceMetric.name} ${sourceMetric.value}% entered the at-or-below ${thresholdPercent}% condition for ${sourceMetric.resourceName}. ` : sourceEvent ? `Synthetic ${sourceEvent.type} event prompted this summary. ` : ""}Local brief preview: ${work.items.length} open work item(s), ${decisions.items.length} decision(s), and ${attention.items.length} synthetic attention item(s). Review the source pages for the complete records. No work was executed or verified.`,
    asOf: brief.asOf,
    evidence: distinctEvidence,
    sourceLabel: "Synthetic local automation",
    isSynthetic: true,
    verificationStatus: "unverified",
    externalActions: [],
  });
}

export interface LocalAutomationProcessingPort {
  getRun(id: string): Promise<AutomationRun | null>;
  getDefinition?(id: string): Promise<AutomationDefinition | null>;
  beginAttempt(id: string): Promise<string | null>;
  recordRead(runId: string, asOf: string): Promise<void>;
  complete(
    runId: string,
    attemptId: string,
    result: AutomationRunResult,
  ): Promise<AutomationRun>;
  failAttempt(runId: string, attemptId: string): Promise<void>;
}

export function createLocalAutomationProcessor(
  port: LocalAutomationProcessingPort,
  briefs: { getBrief(projectId: string): Promise<ProjectBrief | null> },
  events?: {
    getEventById(id: string): Promise<NormalizedSyntheticEvent | null>;
    getMetricSampleById?(id: string): Promise<SyntheticMetricSample | null>;
  },
) {
  return async (job: AutomationJobV1): Promise<AutomationRun> => {
    const parsed = automationJobV1Schema.parse(job);
    const run = await port.getRun(parsed.runId);
    if (!run || run.definitionId !== parsed.definitionId)
      throw new LocalAutomationError(
        "AUTOMATION_RUN_NOT_FOUND",
        "Automation run not found for job",
      );
    if (run.state === "succeeded" || run.state === "skipped") return run;
    const attemptId = await port.beginAttempt(run.id);
    if (!attemptId) {
      const current = await port.getRun(run.id);
      if (!current)
        throw new LocalAutomationError(
          "AUTOMATION_RUN_NOT_FOUND",
          "Automation run not found",
        );
      return current;
    }
    try {
      const sourceEvent = run.sourceEventId
        ? ((await events?.getEventById(run.sourceEventId)) ?? null)
        : null;
      if (
        run.sourceEventId &&
        (!sourceEvent ||
          sourceEvent.id !== run.sourceEventId ||
          sourceEvent.projectId !== run.projectId ||
          !sourceEvent.isSynthetic)
      )
        throw new LocalAutomationError(
          "AUTOMATION_RUN_NOT_FOUND",
          "Synthetic source event is unavailable for this run",
        );
      const sourceMetric = run.sourceMetricSampleId
        ? ((await events?.getMetricSampleById?.(run.sourceMetricSampleId)) ??
          null)
        : null;
      const definition = run.sourceMetricSampleId
        ? ((await port.getDefinition?.(run.definitionId)) ?? null)
        : null;
      if (
        run.sourceMetricSampleId &&
        (!sourceMetric ||
          !definition?.condition ||
          definition.triggerType !== "synthetic_condition" ||
          sourceMetric.id !== run.sourceMetricSampleId ||
          sourceMetric.eventId !== run.sourceEventId ||
          sourceMetric.projectId !== run.projectId ||
          sourceMetric.resourceId !== definition.condition.resourceId ||
          sourceMetric.name !== "external_availability" ||
          sourceMetric.value > definition.condition.thresholdPercent ||
          !sourceMetric.isSynthetic)
      )
        throw new LocalAutomationError(
          "AUTOMATION_RUN_NOT_FOUND",
          "Synthetic metric condition source is unavailable for this run",
        );
      const brief = await briefs.getBrief(run.projectId);
      if (!brief || brief.project.id !== run.projectId)
        throw new LocalAutomationError(
          "PROJECT_NOT_FOUND",
          "Project brief is unavailable",
        );
      await port.recordRead(run.id, brief.asOf);
      return await port.complete(
        run.id,
        attemptId,
        buildLocalProjectSummaryResult(
          brief,
          sourceEvent,
          sourceMetric,
          definition?.condition?.thresholdPercent ?? null,
        ),
      );
    } catch (error) {
      await port.failAttempt(run.id, attemptId);
      throw error;
    }
  };
}
