import { z } from "zod";

export const SCHEMA_COMPATIBILITY = "1";

export const healthResponseSchema = z.object({
  status: z.enum(["alive", "ready", "not_ready"]),
  service: z.literal("web"),
  database: z.enum(["ready", "unavailable"]).optional(),
});

export const versionResponseSchema = z.object({
  sha: z.string().min(1),
  imageDigest: z.string().nullable(),
  buildTime: z.string().nullable(),
  schemaCompatibility: z.string().min(1),
  environment: z.enum(["local", "test", "preview", "production"]),
});

export const errorResponseSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
});

export const correlationMetadataSchema = z.object({
  correlationId: z.string().min(1).max(100),
});

export const entityIdSchema = z.uuid();

export const resourceSummarySchema = z.object({
  id: z.uuid(),
  kind: z.string().min(1),
  name: z.string().min(1),
  subtype: z.string().nullable(),
  parentResourceId: z.uuid().nullable(),
  state: z.string().nullable(),
  externalUrl: z.url().nullable(),
  lastObservedAt: z.iso.datetime({ offset: true }).nullable(),
});

export const createResourceRequestSchema = z.object({
  kind: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  subtype: z.string().trim().min(1).max(100).optional(),
  externalUrl: z.url().optional(),
});

export const setResourceParentRequestSchema = z.strictObject({
  parentResourceId: z.uuid().nullable(),
  expectedParentResourceId: z.uuid().nullable(),
});

export const createResourceDependencyRequestSchema = z.strictObject({
  requiredResourceId: z.uuid(),
});

export const resourceDependencySchema = z.object({
  id: z.uuid(),
  type: z.literal("depends_on"),
  inverseType: z.literal("required_by"),
  direction: z.enum(["outgoing", "incoming"]),
  resource: resourceSummarySchema,
  createdAt: z.iso.datetime({ offset: true }),
});

export const listResourceDependenciesQuerySchema = z.object({
  direction: z.enum(["outgoing", "incoming"]).default("outgoing"),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.uuid().optional(),
});

export const listResourceDependenciesResponseSchema = z.object({
  items: z.array(resourceDependencySchema),
  nextCursor: z.uuid().nullable(),
});

export const projectSummarySchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  summary: z.string().nullable(),
  type: z.string().min(1),
  lifecycle: z.enum(["proposed", "active", "paused", "completed", "archived"]),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const createProjectRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(4000).optional(),
  type: z.string().trim().min(1).max(100).optional(),
});

export const listResourcesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.uuid().optional(),
});

export const listResourcesResponseSchema = z.object({
  items: z.array(resourceSummarySchema),
  nextCursor: z.uuid().nullable(),
});

export const listProjectsQuerySchema = listResourcesQuerySchema;

export const listProjectsResponseSchema = z.object({
  items: z.array(projectSummarySchema),
  nextCursor: z.uuid().nullable(),
});

export const projectResourceRelationshipTypeSchema = z.enum([
  "supports",
  "relates_to",
]);

export const createProjectResourceLinkRequestSchema = z.object({
  resourceId: z.uuid(),
  type: projectResourceRelationshipTypeSchema,
});

export const projectResourceLinkSchema = z.object({
  id: z.uuid(),
  type: projectResourceRelationshipTypeSchema,
  inverseType: z.enum(["supported_by", "relates_to"]),
  resource: resourceSummarySchema,
});

export const projectResourceLinkDetailSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  resourceId: z.uuid(),
  type: projectResourceRelationshipTypeSchema,
  lifecycle: z.enum(["active", "archived"]),
  createdAt: z.iso.datetime({ offset: true }),
});

export const listProjectResourceLinksResponseSchema = z.object({
  items: z.array(projectResourceLinkSchema),
  nextCursor: z.uuid().nullable(),
});

export const createCaptureRequestSchema = z
  .object({
    inputType: z.enum(["text", "url"]),
    originalContent: z
      .string()
      .min(1)
      .max(20_000)
      .refine((value) => value.trim().length > 0),
    projectId: z.uuid().optional(),
  })
  .superRefine((input, context) => {
    if (input.inputType !== "url") return;
    try {
      if (input.originalContent !== input.originalContent.trim()) {
        throw new Error("surrounding whitespace");
      }
      const url = new URL(input.originalContent);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("unsupported protocol");
      }
    } catch {
      context.addIssue({
        code: "custom",
        message: "Capture URL must be a valid HTTP or HTTPS URL",
        path: ["originalContent"],
      });
    }
  });

export const captureSchema = z.object({
  id: z.uuid(),
  inputType: z.enum(["text", "url"]),
  originalContent: z.string(),
  source: z.literal("manual-local"),
  author: z.literal("local-user"),
  state: z.enum(["unfiled", "filed"]),
  projectId: z.uuid().nullable(),
  filedRecord: z
    .object({ kind: z.enum(["task", "note"]), id: z.uuid() })
    .nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  filedAt: z.iso.datetime({ offset: true }).nullable(),
});

export const listCapturesResponseSchema = z.object({
  items: z.array(captureSchema),
  nextCursor: z.uuid().nullable(),
});

export const fileCaptureRequestSchema = z.object({
  projectId: z.uuid(),
  kind: z.enum(["task", "note"]),
  title: z.string().trim().min(1).max(200),
  body: z.string().max(20_000).optional(),
});

export const workItemSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  sourceCaptureId: z.uuid(),
  title: z.string(),
  description: z.string(),
  status: z.enum(["open", "done"]),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const changeWorkItemStatusRequestSchema = z.strictObject({
  status: z.enum(["open", "done"]),
  expectedStatus: z.enum(["open", "done"]),
});

export const workItemStatusEventSchema = z.object({
  id: z.uuid(),
  workItemId: z.uuid(),
  previousStatus: z.enum(["open", "done"]),
  nextStatus: z.enum(["open", "done"]),
  actor: z.literal("local-user:unattributed"),
  createdAt: z.iso.datetime({ offset: true }),
});

export const listWorkItemStatusEventsResponseSchema = z.object({
  items: z.array(workItemStatusEventSchema),
  nextCursor: z.uuid().nullable(),
});

export const knowledgeItemSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  sourceCaptureId: z.uuid(),
  kind: z.literal("note"),
  title: z.string(),
  content: z.string(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const fileCaptureResponseSchema = z.object({
  capture: captureSchema,
  record: z.union([workItemSchema, knowledgeItemSchema]),
});

export const captureTriageSuggestionSchema = z.object({
  id: z.uuid(),
  captureId: z.uuid(),
  kind: z.enum(["task", "note"]),
  proposedProjectId: z.uuid().nullable(),
  title: z.string(),
  confidence: z.number().int().min(0).max(100),
  rationale: z.string(),
  ruleVersion: z.literal("capture-triage/v1"),
  sourceLabel: z.literal("Local deterministic rule"),
  createdAt: z.iso.datetime({ offset: true }),
});

export const captureTriageDecisionSchema = z.object({
  id: z.uuid(),
  captureId: z.uuid(),
  suggestionId: z.uuid(),
  decision: z.enum(["approve", "reject"]),
  selectedProjectId: z.uuid().nullable(),
  selectedKind: z.enum(["task", "note"]).nullable(),
  selectedTitle: z.string().nullable(),
  selectedBody: z.string().nullable(),
  filedRecordId: z.uuid().nullable(),
  actor: z.literal("local-user:unattributed"),
  createdAt: z.iso.datetime({ offset: true }),
});

export const captureTriageReviewSchema = z.object({
  suggestion: captureTriageSuggestionSchema.nullable(),
  decision: captureTriageDecisionSchema.nullable(),
});

export const reviewCaptureTriageRequestSchema = z.discriminatedUnion(
  "decision",
  [
    z.strictObject({
      decision: z.literal("approve"),
      projectId: z.uuid(),
      kind: z.enum(["task", "note"]),
      title: z.string().trim().min(1).max(200),
      body: z.string().max(20_000).optional(),
    }),
    z.strictObject({ decision: z.literal("reject") }),
  ],
);

export const reviewCaptureTriageResponseSchema = z.object({
  capture: captureSchema,
  suggestion: captureTriageSuggestionSchema,
  decision: captureTriageDecisionSchema,
  record: z.union([workItemSchema, knowledgeItemSchema]).nullable(),
});

export const captureTriageJobV1Schema = z.strictObject({
  version: z.literal(1),
  captureId: z.uuid(),
});

export const listWorkItemsResponseSchema = z.object({
  items: z.array(workItemSchema),
  nextCursor: z.uuid().nullable(),
});

export const listKnowledgeItemsResponseSchema = z.object({
  items: z.array(knowledgeItemSchema),
  nextCursor: z.uuid().nullable(),
});

export const decisionFieldsSchema = z.strictObject({
  question: z.string().trim().min(1).max(500),
  outcome: z.string().trim().min(1).max(5_000),
  alternatives: z.string().max(5_000),
  rationale: z.string().trim().min(1).max(5_000),
  status: z.enum(["proposed", "accepted", "superseded"]),
});

export const createProjectDecisionRequestSchema = decisionFieldsSchema;
export const reviseProjectDecisionRequestSchema = decisionFieldsSchema.extend({
  expectedRevision: z.number().int().min(1),
});
export const projectDecisionSchema = decisionFieldsSchema.extend({
  id: z.uuid(),
  projectId: z.uuid(),
  revision: z.number().int().min(1),
  sourceLabel: z.literal("Manual local decision"),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export const projectDecisionRevisionSchema = decisionFieldsSchema.extend({
  id: z.uuid(),
  decisionId: z.uuid(),
  revision: z.number().int().min(1),
  actor: z.literal("local-user:unattributed"),
  createdAt: z.iso.datetime({ offset: true }),
});
export const listProjectDecisionsResponseSchema = z.object({
  items: z.array(projectDecisionSchema),
  nextCursor: z.uuid().nullable(),
});
export const listProjectDecisionRevisionsResponseSchema = z.object({
  items: z.array(projectDecisionRevisionSchema),
  nextCursor: z.uuid().nullable(),
});

export const createAutomationDefinitionRequestSchema = z.strictObject({
  projectId: z.uuid(),
  name: z.string().trim().min(1).max(200),
  enabled: z.boolean(),
});
export const setAutomationEnabledRequestSchema = z.strictObject({
  enabled: z.boolean(),
  expectedEnabled: z.boolean(),
});
export const triggerAutomationRunRequestSchema = z.strictObject({
  occurrenceId: z.uuid(),
  scheduledFor: z.iso.datetime({ offset: true }).optional(),
});
export const automationDefinitionSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  name: z.string(),
  routine: z.literal("local_project_summary_v1"),
  triggerType: z.literal("on_creation_once"),
  enabled: z.boolean(),
  sourceOfTruth: z.literal("local-only"),
  nextRunAt: z.iso.datetime({ offset: true }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export const listAutomationDefinitionsResponseSchema = z.object({
  items: z.array(automationDefinitionSchema),
  nextCursor: z.uuid().nullable(),
});
export const listAutomationDefinitionsQuerySchema =
  listResourcesQuerySchema.extend({
    projectId: z.uuid().optional(),
  });

export const searchQuerySchema = listResourcesQuerySchema.extend({
  q: z.string().trim().min(1).max(200),
  projectId: z.uuid().optional(),
});

export const searchResultSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["capture", "task", "note", "decision", "project", "resource"]),
  title: z.string(),
  excerpt: z.string(),
  href: z.string().startsWith("/"),
  projectId: z.uuid().nullable(),
  sourceCaptureId: z.uuid().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});

export const searchResponseSchema = z.object({
  items: z.array(searchResultSchema),
  nextCursor: z.uuid().nullable(),
});

export const syntheticScenarioIdSchema = z.enum([
  "development.pr-merged",
  "operations.monitor-down",
  "operations.monitor-recovered",
]);

export const syntheticSourceKindSchema = z.enum([
  "synthetic-development",
  "synthetic-operations",
]);

export const syntheticSourceLabelSchema = z.enum([
  "Synthetic development fixture",
  "Synthetic operational fixture",
]);

export const createSyntheticEventImportRequestSchema = z.object({
  scenarioId: syntheticScenarioIdSchema,
  projectId: z.uuid(),
  resourceId: z.uuid().optional(),
  occurrenceId: z.string().trim().min(1).max(180),
  occurredAt: z.iso.datetime({ offset: true }).optional(),
});

export const syntheticEventImportJobV1Schema = z.object({
  version: z.literal(1),
  runId: z.uuid(),
  occurrenceId: z.string().min(1).max(180),
});

export const syntheticEventImportSchema = z.object({
  id: z.uuid(),
  occurrenceId: z.string(),
  scenarioId: syntheticScenarioIdSchema,
  projectId: z.uuid(),
  resourceId: z.uuid().nullable(),
  sourceKind: syntheticSourceKindSchema,
  sourceLabel: syntheticSourceLabelSchema,
  isSynthetic: z.literal(true),
  state: z.enum(["queued", "running", "succeeded", "failed"]),
  attempts: z.number().int().min(0),
  error: z.string().nullable(),
  sourceEnvelopeId: z.uuid(),
  eventId: z.uuid().nullable(),
  occurredAt: z.iso.datetime({ offset: true }),
  receivedAt: z.iso.datetime({ offset: true }),
  createdAt: z.iso.datetime({ offset: true }),
  completedAt: z.iso.datetime({ offset: true }).nullable(),
});

export const listSyntheticEventImportsResponseSchema = z.object({
  items: z.array(syntheticEventImportSchema),
  nextCursor: z.uuid().nullable(),
});

export const sourceEnvelopeSchema = z.object({
  id: z.uuid(),
  importId: z.uuid(),
  sourceKind: syntheticSourceKindSchema,
  sourceLabel: syntheticSourceLabelSchema,
  sourceSchemaVersion: z.literal("synthetic-fixture/v1"),
  sourceEventId: z.string(),
  rawPayload: z.record(z.string(), z.string().nullable()),
  occurredAt: z.iso.datetime({ offset: true }),
  receivedAt: z.iso.datetime({ offset: true }),
  isSynthetic: z.literal(true),
});

export const normalizedEventSchema = z.object({
  id: z.uuid(),
  type: z.enum([
    "git.pull_request.merged",
    "monitor.down",
    "monitor.recovered",
  ]),
  summary: z.string(),
  severity: z.enum(["info", "critical"]),
  projectId: z.uuid(),
  resourceId: z.uuid().nullable(),
  occurredAt: z.iso.datetime({ offset: true }),
  ingestedAt: z.iso.datetime({ offset: true }),
  sourceEnvelopeId: z.uuid(),
  sourceKind: syntheticSourceKindSchema,
  sourceLabel: syntheticSourceLabelSchema,
  isSynthetic: z.literal(true),
  processingVersion: z.literal("synthetic-projection/v1"),
  alertId: z.uuid().nullable(),
  evidenceHref: z.string().startsWith("/api/v1/source-envelopes/"),
});

export const listNormalizedEventsResponseSchema = z.object({
  items: z.array(normalizedEventSchema),
  nextCursor: z.uuid().nullable(),
});

export const syntheticAlertSchema = z.object({
  id: z.uuid(),
  state: z.enum(["open", "resolved"]),
  severity: z.literal("critical"),
  ruleId: z.literal("synthetic.monitor.availability.v1"),
  reason: z.string(),
  projectId: z.uuid(),
  resourceId: z.uuid(),
  firstObservedAt: z.iso.datetime({ offset: true }),
  lastObservedAt: z.iso.datetime({ offset: true }),
  resolvedAt: z.iso.datetime({ offset: true }).nullable(),
  lastEventId: z.uuid(),
  evidenceEventIds: z.array(z.uuid()),
  sourceKind: z.literal("synthetic-operations"),
  sourceLabel: z.literal("Synthetic operational fixture"),
  isSynthetic: z.literal(true),
});

export const listSyntheticAlertsQuerySchema = listResourcesQuerySchema.extend({
  projectId: z.uuid().optional(),
  resourceId: z.uuid().optional(),
  state: z.enum(["open", "resolved"]).optional(),
});

export const listSyntheticAlertsResponseSchema = z.object({
  items: z.array(syntheticAlertSchema),
  nextCursor: z.uuid().nullable(),
});

export const listNormalizedEventsQuerySchema = listResourcesQuerySchema.extend({
  projectId: z.uuid().optional(),
  resourceId: z.uuid().optional(),
});

export const attentionItemSchema = z.object({
  id: z.uuid(),
  priority: z.literal("critical"),
  title: z.string(),
  reason: z.string(),
  ruleId: z.literal("synthetic.monitor.availability.v1"),
  alertId: z.uuid(),
  projectId: z.uuid(),
  resourceId: z.uuid(),
  lastObservedAt: z.iso.datetime({ offset: true }),
  evidenceEventIds: z.array(z.uuid()),
  evidenceHref: z.string().startsWith("/api/v1/events/"),
  sourceLabel: z.literal("Synthetic operational fixture"),
  isSynthetic: z.literal(true),
});

export const listAttentionQuerySchema = listResourcesQuerySchema.extend({
  projectId: z.uuid().optional(),
});

export const listAttentionResponseSchema = z.object({
  items: z.array(attentionItemSchema),
  nextCursor: z.uuid().nullable(),
});

export const evidenceReferenceSchema = z.object({
  kind: z.enum([
    "project",
    "work_item",
    "knowledge_item",
    "decision",
    "resource",
    "project_resource_link",
    "event",
    "alert",
    "capture",
  ]),
  id: z.uuid(),
  href: z.string().startsWith("/api/v1/"),
  recordedAt: z.iso.datetime({ offset: true }),
  occurredAt: z.iso.datetime({ offset: true }).nullable(),
  sourceLabel: z.string().min(1),
  isSynthetic: z.boolean(),
});

export const automationRunResultSchema = z.object({
  summary: z.string().min(1),
  asOf: z.iso.datetime({ offset: true }),
  evidence: z.array(evidenceReferenceSchema).min(1),
  sourceLabel: z.literal("Synthetic local automation"),
  isSynthetic: z.literal(true),
  verificationStatus: z.literal("unverified"),
  externalActions: z.tuple([]),
});
export const automationRunSchema = z.object({
  id: z.uuid(),
  definitionId: z.uuid(),
  projectId: z.uuid(),
  occurrenceId: z.uuid(),
  trigger: z.enum(["on_creation", "manual", "scheduled"]),
  scheduledFor: z.iso.datetime({ offset: true }).nullable(),
  state: z.enum(["queued", "running", "succeeded", "failed", "skipped"]),
  attempts: z.number().int().min(0),
  result: automationRunResultSchema.nullable(),
  error: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  startedAt: z.iso.datetime({ offset: true }).nullable(),
  completedAt: z.iso.datetime({ offset: true }).nullable(),
});
export const automationRunAttemptSchema = z.object({
  id: z.uuid(),
  runId: z.uuid(),
  ordinal: z.number().int().min(1),
  state: z.enum(["running", "succeeded", "failed"]),
  error: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  completedAt: z.iso.datetime({ offset: true }).nullable(),
});
export const automationAuditEventSchema = z.object({
  id: z.uuid(),
  definitionId: z.uuid(),
  runId: z.uuid().nullable(),
  actor: z.string(),
  operation: z.string(),
  details: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null()]),
  ),
  createdAt: z.iso.datetime({ offset: true }),
});
export const listAutomationRunsResponseSchema = z.object({
  items: z.array(automationRunSchema),
  nextCursor: z.uuid().nullable(),
});
export const listAutomationRunAttemptsResponseSchema = z.object({
  items: z.array(automationRunAttemptSchema),
  nextCursor: z.uuid().nullable(),
});
export const listAutomationAuditResponseSchema = z.object({
  items: z.array(automationAuditEventSchema),
  nextCursor: z.uuid().nullable(),
});
export const automationJobV1Schema = z.strictObject({
  version: z.literal(1),
  runId: z.uuid(),
  definitionId: z.uuid(),
});

export const notificationSchema = z.object({
  id: z.string().min(1).max(120),
  kind: z.enum(["synthetic_alert", "approval", "automation_failure"]),
  projectId: z.uuid(),
  projectName: z.string().min(1),
  priority: z.enum(["critical", "action_required", "informational"]),
  title: z.string().min(1),
  reason: z.string().min(1),
  sourceLabel: z.string().min(1),
  isSynthetic: z.literal(true),
  occurredAt: z.iso.datetime({ offset: true }),
  href: z.string().startsWith("/"),
  evidenceHref: z.string().startsWith("/api/v1/"),
  state: z.enum(["unread", "acknowledged", "dismissed", "snoozed"]),
  snoozedUntil: z.iso.datetime({ offset: true }).nullable(),
  version: z.number().int().min(0),
});

export const listNotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().min(1).max(500).optional(),
  view: z.enum(["active", "all"]).default("active"),
  projectId: z.uuid().optional(),
});

export const listNotificationsResponseSchema = z.object({
  items: z.array(notificationSchema),
  nextCursor: z.string().nullable(),
});

export const changeNotificationStateRequestSchema = z.discriminatedUnion(
  "action",
  [
    z.strictObject({
      action: z.literal("acknowledge"),
      expectedVersion: z.number().int().min(0),
    }),
    z.strictObject({
      action: z.literal("dismiss"),
      expectedVersion: z.number().int().min(0),
    }),
    z.strictObject({
      action: z.literal("restore"),
      expectedVersion: z.number().int().min(0),
    }),
    z.strictObject({
      action: z.literal("snooze"),
      expectedVersion: z.number().int().min(0),
      snoozedUntil: z.iso.datetime({ offset: true }),
    }),
  ],
);

export const notificationAuditEventSchema = z.object({
  id: z.uuid(),
  notificationId: z.string(),
  actor: z.string(),
  operation: z.literal("notification.state_changed"),
  previousState: z.enum(["unread", "acknowledged", "dismissed", "snoozed"]),
  nextState: z.enum(["unread", "acknowledged", "dismissed", "snoozed"]),
  snoozedUntil: z.iso.datetime({ offset: true }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});

export const listNotificationAuditResponseSchema = z.object({
  items: z.array(notificationAuditEventSchema),
  nextCursor: z.uuid().nullable(),
});

export const briefFactSchema = z.object({
  id: z.uuid(),
  kind: z.enum([
    "work_item",
    "knowledge_item",
    "decision",
    "resource",
    "event",
    "alert",
  ]),
  title: z.string().min(1),
  detail: z.string(),
  evidence: z.array(evidenceReferenceSchema).min(1),
  sourceLabel: z.string().min(1),
  isSynthetic: z.boolean(),
});

export const briefSectionSchema = z.object({
  items: z.array(briefFactSchema),
  nextCursor: z.uuid().nullable(),
  fullListHref: z.string().startsWith("/api/v1/"),
  emptyState: z.string().nullable(),
});

export const notRecordedSchema = z.object({
  status: z.literal("not_recorded"),
  message: z.string().min(1),
});

export const briefInferenceSchema = z.object({
  kind: z.literal("inference"),
  ruleId: z.literal("open-work-review-v1"),
  text: z.string().min(1),
  evidence: z.array(evidenceReferenceSchema).min(1),
});

export const projectBriefSchema = z.object({
  project: projectSummarySchema,
  generatedAt: z.iso.datetime({ offset: true }),
  asOf: z.iso.datetime({ offset: true }),
  method: z.literal("deterministic-local-v1"),
  state: z.object({
    text: z.string().min(1),
    evidence: z.array(evidenceReferenceSchema).min(1),
  }),
  sections: z.object({
    work: briefSectionSchema,
    knowledge: briefSectionSchema,
    decisions: briefSectionSchema,
    resources: briefSectionSchema,
    activity: briefSectionSchema,
    attention: briefSectionSchema,
  }),
  missing: z.object({
    questions: notRecordedSchema,
    blockers: notRecordedSchema,
    acceptanceCriteria: notRecordedSchema,
  }),
  nextActions: z.object({
    items: z.array(briefInferenceSchema),
    scope: z.literal("preview_only"),
    explanation: z.string().min(1),
  }),
});

const distinctPacketIdsSchema = z
  .array(z.uuid())
  .max(10)
  .refine(
    (ids) => new Set(ids).size === ids.length,
    "Selected IDs must be distinct",
  );

export const createExecutionPacketRequestSchema = z.object({
  selectedKnowledgeIds: distinctPacketIdsSchema.optional(),
  selectedResourceIds: distinctPacketIdsSchema.optional(),
});

export const executionPacketSnapshotSchema = z.object({
  objective: z.object({
    title: z.string().min(1),
    description: z.string(),
    status: z.enum(["open", "done"]),
    evidence: z.array(evidenceReferenceSchema).min(2),
  }),
  projectContext: z.object({
    id: z.uuid(),
    name: z.string().min(1),
    summary: z.string().nullable(),
    type: z.string().min(1),
    lifecycle: projectSummarySchema.shape.lifecycle,
    evidence: evidenceReferenceSchema,
  }),
  selectedKnowledge: z.array(
    z.object({
      id: z.uuid(),
      title: z.string().min(1),
      evidence: evidenceReferenceSchema,
    }),
  ),
  selectedResources: z.array(
    z
      .object({
        id: z.uuid(),
        linkId: z.uuid(),
        linkType: projectResourceRelationshipTypeSchema,
        evidence: evidenceReferenceSchema,
      })
      .strict(),
  ),
  missing: z.object({
    acceptanceCriteria: notRecordedSchema,
    verificationExpectations: notRecordedSchema,
    taskConstraints: notRecordedSchema,
  }),
  authorization: z.object({
    capabilityGrants: z.array(z.string()).length(0),
    externalActions: z.literal("not_authorized"),
    explanation: z.string().min(1),
  }),
});

export const executionPacketSchema = z.object({
  id: z.uuid(),
  schemaVersion: z.literal("execution-packet/v1"),
  packetVersion: z.number().int().min(1),
  workItemId: z.uuid(),
  projectId: z.uuid(),
  sourceCaptureId: z.uuid(),
  generatedAt: z.iso.datetime({ offset: true }),
  contentDigest: z.string().regex(/^[a-f0-9]{64}$/),
  snapshot: executionPacketSnapshotSchema,
});

export const listExecutionPacketsResponseSchema = z.object({
  items: z.array(executionPacketSchema),
  nextCursor: z.uuid().nullable(),
});

export const createLocalAgentRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  role: z.string().trim().min(1).max(200).optional(),
});

export const localAgentProfileSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  role: z.string().nullable(),
  runtime: z.literal("local-fake-v1"),
  sourceLabel: z.literal("Synthetic local agent"),
  isSynthetic: z.literal(true),
  createdAt: z.iso.datetime({ offset: true }),
});

export const listLocalAgentsResponseSchema = z.object({
  items: z.array(localAgentProfileSchema),
  nextCursor: z.uuid().nullable(),
});

export const createLocalAgentProjectAssignmentRequestSchema = z.object({
  projectId: z.uuid(),
});

export const localAgentProjectAssignmentSchema = z.object({
  id: z.uuid(),
  agentId: z.uuid(),
  projectId: z.uuid(),
  isSynthetic: z.literal(true),
  createdAt: z.iso.datetime({ offset: true }),
});

export const listLocalAgentProjectAssignmentsResponseSchema = z.object({
  items: z.array(localAgentProjectAssignmentSchema),
  nextCursor: z.uuid().nullable(),
});

export const localAgentReadOperationSchema = z.enum([
  "project.brief.read",
  "work.read",
]);

export const createLocalAgentRunRequestSchema = z.object({
  agentId: z.uuid(),
  occurrenceId: z.string().trim().min(1).max(180),
});

export const localAgentRunJobV1Schema = z.object({
  version: z.literal(1),
  runId: z.uuid(),
  occurrenceId: z.string().min(1).max(180),
});

export const localAgentRunGrantSchema = z.object({
  projectId: z.uuid(),
  operations: z.array(localAgentReadOperationSchema).length(2),
  expiresAt: z.iso.datetime({ offset: true }),
});

export const fakeLocalAgentRunResultSchema = z.object({
  summary: z.string().min(1),
  contextReadIds: z.array(z.uuid()),
  evidence: z.array(evidenceReferenceSchema).min(1),
  runtime: z.literal("local-fake-v1"),
  isSynthetic: z.literal(true),
  verificationStatus: z.literal("unverified"),
  externalActions: z.array(z.string()).max(0),
});

export const localAgentRunAttemptSchema = z.object({
  id: z.uuid(),
  number: z.number().int().min(1),
  state: z.enum(["running", "succeeded", "failed"]),
  error: z.string().nullable(),
  startedAt: z.iso.datetime({ offset: true }),
  completedAt: z.iso.datetime({ offset: true }).nullable(),
});

export const localAgentRunSchema = z.object({
  id: z.uuid(),
  occurrenceId: z.string(),
  agentId: z.uuid(),
  packetId: z.uuid(),
  packetVersion: z.number().int().min(1),
  packetDigest: z.string().regex(/^[a-f0-9]{64}$/),
  workItemId: z.uuid(),
  projectId: z.uuid(),
  state: z.enum(["queued", "running", "succeeded", "failed"]),
  attempts: z.number().int().min(0),
  attemptHistory: z.array(localAgentRunAttemptSchema),
  grant: localAgentRunGrantSchema,
  result: fakeLocalAgentRunResultSchema.nullable(),
  error: z.string().nullable(),
  verificationStatus: z.literal("unverified"),
  runtime: z.literal("local-fake-v1"),
  sourceLabel: z.literal("Synthetic local agent"),
  isSynthetic: z.literal(true),
  externalActions: z.array(z.string()).max(0),
  createdAt: z.iso.datetime({ offset: true }),
  startedAt: z.iso.datetime({ offset: true }).nullable(),
  completedAt: z.iso.datetime({ offset: true }).nullable(),
});

export const agentContextReadRequestSchema = z.object({
  projectId: z.uuid(),
  operation: z.string().trim().min(1).max(100),
  reason: z.string().trim().min(1).max(500),
});

export const agentContextReadSourceSchema = z.object({
  kind: z.enum(["project_brief", "work_item"]),
  id: z.uuid(),
  title: z.string().min(1),
  summary: z.string(),
  href: z.string().startsWith("/api/v1/"),
  recordedAt: z.iso.datetime({ offset: true }),
  sourceLabel: z.string().min(1),
  isSynthetic: z.boolean(),
  evidence: z.array(evidenceReferenceSchema).min(1),
  brief: projectBriefSchema.nullable(),
});

export const agentContextReadResponseSchema = z.object({
  runId: z.uuid(),
  projectId: z.uuid(),
  operation: localAgentReadOperationSchema,
  readAt: z.iso.datetime({ offset: true }),
  sensitivity: z.literal("unclassified-local-data"),
  isSynthetic: z.literal(true),
  source: agentContextReadSourceSchema,
  auditId: z.uuid(),
});

export const agentRunAuditEventSchema = z.object({
  id: z.uuid(),
  runId: z.uuid(),
  actor: z.string().min(1),
  operation: z.string().min(1),
  projectId: z.uuid().nullable(),
  decision: z.enum(["allowed", "denied"]).nullable(),
  code: z.string().nullable(),
  reason: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});

export const listAgentRunAuditResponseSchema = z.object({
  items: z.array(agentRunAuditEventSchema),
  nextCursor: z.uuid().nullable(),
});

// This provisional local action contract cannot carry commands, URLs, credentials,
// arbitrary parameters, or claims about a real external effect.
export const createSimulatedActionRequestSchema = z
  .object({
    projectResourceLinkId: z.uuid(),
    mode: z.literal("graceful"),
    occurrenceId: z.string().trim().min(1).max(180),
  })
  .strict();

export const simulatedApprovalAutomaticCeilingSchema = z.enum([
  "read_only",
  "reversible",
]);

export const simulatedApprovalDescriptorSchema = z
  .object({
    schemaVersion: z.literal("simulated-resource-restart/v1"),
    actionType: z.literal("simulated.resource.restart"),
    intendedActor: z.object({ agentId: z.uuid(), runId: z.uuid() }).strict(),
    proposedBy: z.literal("local-reviewer:unattributed"),
    packet: z
      .object({
        id: z.uuid(),
        version: z.number().int().min(1),
        digest: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
    target: z
      .object({
        projectId: z.uuid(),
        resourceId: z.uuid(),
        projectResourceLinkId: z.uuid(),
      })
      .strict(),
    parameters: z.object({ mode: z.literal("graceful") }).strict(),
    reason: z.literal(
      "Demonstrate approval review for a synthetic local resource restart.",
    ),
    expectedResult: z.literal(
      "Record a no-effect local simulation; resource state does not change.",
    ),
    risk: z.literal("sensitive"),
    requiredCapability: z.literal("infrastructure.restart"),
    policy: z
      .object({
        automaticCeiling: simulatedApprovalAutomaticCeilingSchema,
        approvalRequired: z.literal(true),
        grantScope: z.literal("simulation_only"),
      })
      .strict(),
    reversibility: z
      .object({
        isApplicable: z.literal(false),
        explanation: z.literal(
          "No real change is made; rollback is not applicable.",
        ),
      })
      .strict(),
    expiresAt: z.iso.datetime({ offset: true }),
    sourceLabel: z.literal("Synthetic local action proposal"),
    isSynthetic: z.literal(true),
    externalActions: z.array(z.string()).max(0),
  })
  .strict();

export const simulatedApprovalStateSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "cancelled",
  "expired",
]);

export const simulatedApprovalDecisionRequestSchema = z
  .object({
    decision: z.enum(["approve", "reject", "cancel"]),
    expectedDigest: z.string().regex(/^[a-f0-9]{64}$/),
    occurrenceId: z.string().trim().min(1).max(180),
  })
  .strict();

export const simulatedApprovalDecisionSchema = z.object({
  kind: simulatedApprovalDecisionRequestSchema.shape.decision,
  actor: z.literal("local-reviewer:unattributed"),
  occurrenceId: z.string().min(1),
  decidedAt: z.iso.datetime({ offset: true }),
});

export const simulatedApprovalOutcomeSchema = z.object({
  kind: z.literal("simulated_only"),
  verificationStatus: z.literal("unverified"),
  externalActions: z.array(z.string()).max(0),
  resourceStateChanged: z.literal(false),
  recordedAt: z.iso.datetime({ offset: true }),
  summary: z.literal(
    "Synthetic local restart simulation recorded. No external action occurred and resource state did not change.",
  ),
});

export const simulatedApprovalSchema = z.object({
  id: z.uuid(),
  occurrenceId: z.string().min(1),
  requestFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  descriptorDigest: z.string().regex(/^[a-f0-9]{64}$/),
  descriptor: simulatedApprovalDescriptorSchema,
  state: simulatedApprovalStateSchema,
  decision: simulatedApprovalDecisionSchema.nullable(),
  outcome: simulatedApprovalOutcomeSchema.nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const listSimulatedApprovalsQuerySchema =
  listResourcesQuerySchema.extend({
    state: simulatedApprovalStateSchema.optional(),
  });

export const listSimulatedApprovalsResponseSchema = z.object({
  items: z.array(simulatedApprovalSchema),
  nextCursor: z.uuid().nullable(),
});

export const simulatedApprovalAuditEventSchema = z.object({
  id: z.uuid(),
  approvalId: z.uuid(),
  eventType: z.enum([
    "proposed",
    "approved",
    "rejected",
    "cancelled",
    "expired",
    "simulation_recorded",
  ]),
  actor: z.enum(["local-reviewer:unattributed", "local-worker"]),
  occurrenceId: z.string().nullable(),
  detail: z.string().min(1),
  createdAt: z.iso.datetime({ offset: true }),
});

export const listSimulatedApprovalAuditResponseSchema = z.object({
  items: z.array(simulatedApprovalAuditEventSchema),
  nextCursor: z.uuid().nullable(),
});

export const simulatedApprovalJobV1Schema = z.object({
  version: z.literal(1),
  approvalId: z.uuid(),
  descriptorDigest: z.string().regex(/^[a-f0-9]{64}$/),
});

export const createSyntheticRunRequestSchema = z.object({
  idempotencyKey: z.string().trim().min(1).max(180),
});

export const syntheticJobV1Schema = z.object({
  version: z.literal(1),
  runId: z.uuid(),
  occurrenceId: z.string().min(1).max(200),
});

export const syntheticRunSchema = z.object({
  id: z.uuid(),
  occurrenceId: z.string(),
  state: z.enum(["queued", "running", "succeeded", "failed"]),
  attempts: z.number().int().min(0),
  result: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  startedAt: z.iso.datetime({ offset: true }).nullable(),
  completedAt: z.iso.datetime({ offset: true }).nullable(),
});

export type ResourceSummary = z.infer<typeof resourceSummarySchema>;
export type ProjectSummary = z.infer<typeof projectSummarySchema>;
export type ProjectResourceLink = z.infer<typeof projectResourceLinkSchema>;
export type ProjectResourceLinkDetail = z.infer<
  typeof projectResourceLinkDetailSchema
>;
export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;
export type CreateResourceRequest = z.infer<typeof createResourceRequestSchema>;
export type SetResourceParentRequest = z.infer<
  typeof setResourceParentRequestSchema
>;
export type CreateResourceDependencyRequest = z.infer<
  typeof createResourceDependencyRequestSchema
>;
export type ResourceDependency = z.infer<typeof resourceDependencySchema>;
export type CreateProjectResourceLinkRequest = z.infer<
  typeof createProjectResourceLinkRequestSchema
>;
export type CreateCaptureRequest = z.infer<typeof createCaptureRequestSchema>;
export type Capture = z.infer<typeof captureSchema>;
export type FileCaptureRequest = z.infer<typeof fileCaptureRequestSchema>;
export type WorkItem = z.infer<typeof workItemSchema>;
export type ChangeWorkItemStatusRequest = z.infer<
  typeof changeWorkItemStatusRequestSchema
>;
export type WorkItemStatusEvent = z.infer<typeof workItemStatusEventSchema>;
export type KnowledgeItem = z.infer<typeof knowledgeItemSchema>;
export type ProjectDecision = z.infer<typeof projectDecisionSchema>;
export type ProjectDecisionRevision = z.infer<
  typeof projectDecisionRevisionSchema
>;
export type CreateProjectDecisionRequest = z.infer<
  typeof createProjectDecisionRequestSchema
>;
export type ReviseProjectDecisionRequest = z.infer<
  typeof reviseProjectDecisionRequestSchema
>;
export type CreateAutomationDefinitionRequest = z.infer<
  typeof createAutomationDefinitionRequestSchema
>;
export type SetAutomationEnabledRequest = z.infer<
  typeof setAutomationEnabledRequestSchema
>;
export type TriggerAutomationRunRequest = z.infer<
  typeof triggerAutomationRunRequestSchema
>;
export type AutomationDefinition = z.infer<typeof automationDefinitionSchema>;
export type AutomationRunResult = z.infer<typeof automationRunResultSchema>;
export type AutomationRun = z.infer<typeof automationRunSchema>;
export type AutomationRunAttempt = z.infer<typeof automationRunAttemptSchema>;
export type AutomationAuditEvent = z.infer<typeof automationAuditEventSchema>;
export type AutomationJobV1 = z.infer<typeof automationJobV1Schema>;
export type Notification = z.infer<typeof notificationSchema>;
export type ChangeNotificationStateRequest = z.infer<
  typeof changeNotificationStateRequestSchema
>;
export type NotificationAuditEvent = z.infer<
  typeof notificationAuditEventSchema
>;
export type FileCaptureResponse = z.infer<typeof fileCaptureResponseSchema>;
export type CaptureTriageSuggestion = z.infer<
  typeof captureTriageSuggestionSchema
>;
export type CaptureTriageDecision = z.infer<typeof captureTriageDecisionSchema>;
export type CaptureTriageReview = z.infer<typeof captureTriageReviewSchema>;
export type ReviewCaptureTriageRequest = z.infer<
  typeof reviewCaptureTriageRequestSchema
>;
export type ReviewCaptureTriageResponse = z.infer<
  typeof reviewCaptureTriageResponseSchema
>;
export type SearchResult = z.infer<typeof searchResultSchema>;
export type CreateSyntheticEventImportRequest = z.infer<
  typeof createSyntheticEventImportRequestSchema
>;
export type SyntheticEventImportJobV1 = z.infer<
  typeof syntheticEventImportJobV1Schema
>;
export type SyntheticEventImportRecord = z.infer<
  typeof syntheticEventImportSchema
>;
export type SourceEnvelopeRecord = z.infer<typeof sourceEnvelopeSchema>;
export type NormalizedSyntheticEvent = z.infer<typeof normalizedEventSchema>;
export type SyntheticAlert = z.infer<typeof syntheticAlertSchema>;
export type AttentionItem = z.infer<typeof attentionItemSchema>;
export type EvidenceReference = z.infer<typeof evidenceReferenceSchema>;
export type BriefFact = z.infer<typeof briefFactSchema>;
export type ProjectBrief = z.infer<typeof projectBriefSchema>;
export type CreateExecutionPacketRequest = z.infer<
  typeof createExecutionPacketRequestSchema
>;
export type ExecutionPacketSnapshot = z.infer<
  typeof executionPacketSnapshotSchema
>;
export type ExecutionPacket = z.infer<typeof executionPacketSchema>;
export type CreateLocalAgentRequest = z.infer<
  typeof createLocalAgentRequestSchema
>;
export type LocalAgentProfile = z.infer<typeof localAgentProfileSchema>;
export type LocalAgentProjectAssignment = z.infer<
  typeof localAgentProjectAssignmentSchema
>;
export type CreateLocalAgentRunRequest = z.infer<
  typeof createLocalAgentRunRequestSchema
>;
export type LocalAgentRunJobV1 = z.infer<typeof localAgentRunJobV1Schema>;
export type FakeLocalAgentRunResult = z.infer<
  typeof fakeLocalAgentRunResultSchema
>;
export type LocalAgentRun = z.infer<typeof localAgentRunSchema>;
export type AgentContextReadRequest = z.infer<
  typeof agentContextReadRequestSchema
>;
export type AgentContextReadResponse = z.infer<
  typeof agentContextReadResponseSchema
>;
export type AgentRunAuditEvent = z.infer<typeof agentRunAuditEventSchema>;
export type CreateSimulatedActionRequest = z.infer<
  typeof createSimulatedActionRequestSchema
>;
export type SimulatedApprovalAutomaticCeiling = z.infer<
  typeof simulatedApprovalAutomaticCeilingSchema
>;
export type SimulatedApprovalDescriptor = z.infer<
  typeof simulatedApprovalDescriptorSchema
>;
export type SimulatedApprovalState = z.infer<
  typeof simulatedApprovalStateSchema
>;
export type SimulatedApprovalDecisionRequest = z.infer<
  typeof simulatedApprovalDecisionRequestSchema
>;
export type SimulatedApproval = z.infer<typeof simulatedApprovalSchema>;
export type SimulatedApprovalAuditEvent = z.infer<
  typeof simulatedApprovalAuditEventSchema
>;
export type SimulatedApprovalJobV1 = z.infer<
  typeof simulatedApprovalJobV1Schema
>;
export type SyntheticJobV1 = z.infer<typeof syntheticJobV1Schema>;
export type SyntheticRunResponse = z.infer<typeof syntheticRunSchema>;
