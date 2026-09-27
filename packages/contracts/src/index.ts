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

export const domainSummarySchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  description: z.string().nullable(),
  lifecycle: z.enum(["active", "archived"]),
  version: z.number().int().min(1),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const createDomainRequestSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).optional(),
});

export const updateDomainRequestSchema = z
  .strictObject({
    expectedVersion: z.number().int().min(1),
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(4000).nullable().optional(),
  })
  .refine(
    (input) => input.name !== undefined || input.description !== undefined,
    "Provide a name or description to change",
  );

export const archiveDomainRequestSchema = z.strictObject({
  expectedVersion: z.number().int().min(1),
});

export const setProjectDomainRequestSchema = z.strictObject({
  domainId: z.uuid().nullable(),
  expectedDomainId: z.uuid().nullable(),
});

export const domainAuditEventSchema = z.object({
  id: z.uuid(),
  domainId: z.uuid(),
  projectId: z.uuid().nullable(),
  actor: z.literal("local-user:unattributed"),
  operation: z.enum([
    "domain.created",
    "domain.updated",
    "domain.archived",
    "domain.project_linked",
    "domain.project_unlinked",
  ]),
  details: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null()]),
  ),
  createdAt: z.iso.datetime({ offset: true }),
});

export const projectDomainLinkSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  domainId: z.uuid(),
  type: z.literal("owned_by"),
  inverseType: z.literal("owns"),
  sourceKind: z.literal("project"),
  targetKind: z.literal("domain"),
  lifecycle: z.enum(["active", "archived"]),
  provenance: z.literal("manual"),
  createdAt: z.iso.datetime({ offset: true }),
  archivedAt: z.iso.datetime({ offset: true }).nullable(),
});

export const projectDomainMembershipSchema = z.object({
  domain: domainSummarySchema,
  link: projectDomainLinkSchema,
});

export const projectDomainResponseSchema = z.object({
  membership: projectDomainMembershipSchema.nullable(),
});

export const systemSummarySchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  summary: z.string().nullable(),
  lifecycle: z.enum(["active", "archived"]),
  version: z.number().int().min(1),
  domain: domainSummarySchema
    .pick({ id: true, name: true })
    .nullable()
    .optional(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const createSystemRequestSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(4000).optional(),
});

export const updateSystemRequestSchema = z
  .strictObject({
    expectedVersion: z.number().int().min(1),
    name: z.string().trim().min(1).max(200).optional(),
    summary: z.string().trim().max(4000).nullable().optional(),
  })
  .refine(
    (input) => input.name !== undefined || input.summary !== undefined,
    "Provide a name or summary to change",
  );

export const archiveSystemRequestSchema = z.strictObject({
  expectedVersion: z.number().int().min(1),
});

export const setSystemDomainRequestSchema = z.strictObject({
  domainId: z.uuid().nullable(),
  expectedDomainId: z.uuid().nullable(),
});

export const linkSystemProjectRequestSchema = z.strictObject({
  projectId: z.uuid(),
});

export const linkSystemResourceRequestSchema = z.strictObject({
  resourceId: z.uuid(),
});

export const systemDomainLinkSchema = z.object({
  id: z.uuid(),
  systemId: z.uuid(),
  domainId: z.uuid(),
  type: z.literal("owned_by"),
  inverseType: z.literal("owns"),
  sourceKind: z.literal("system"),
  targetKind: z.literal("domain"),
  lifecycle: z.enum(["active", "archived"]),
  provenance: z.literal("manual"),
  createdAt: z.iso.datetime({ offset: true }),
  archivedAt: z.iso.datetime({ offset: true }).nullable(),
});

export const systemProjectLinkSchema = z.object({
  id: z.uuid(),
  systemId: z.uuid(),
  projectId: z.uuid(),
  type: z.literal("relates_to"),
  inverseType: z.literal("relates_to"),
  sourceKind: z.literal("system"),
  targetKind: z.literal("project"),
  lifecycle: z.enum(["active", "archived"]),
  provenance: z.literal("manual"),
  createdAt: z.iso.datetime({ offset: true }),
  archivedAt: z.iso.datetime({ offset: true }).nullable(),
});

export const systemResourceLinkSchema = z.object({
  id: z.uuid(),
  systemId: z.uuid(),
  resourceId: z.uuid(),
  type: z.literal("supports"),
  inverseType: z.literal("supported_by"),
  sourceKind: z.literal("resource"),
  targetKind: z.literal("system"),
  lifecycle: z.enum(["active", "archived"]),
  provenance: z.literal("manual"),
  createdAt: z.iso.datetime({ offset: true }),
  archivedAt: z.iso.datetime({ offset: true }).nullable(),
});

export const systemDomainMembershipSchema = z.object({
  domain: domainSummarySchema,
  link: systemDomainLinkSchema,
});

export const systemDomainResponseSchema = z.object({
  membership: systemDomainMembershipSchema.nullable(),
});

export const systemResourceConnectionSchema = z.object({
  system: systemSummarySchema,
  resource: resourceSummarySchema,
  link: systemResourceLinkSchema,
});

export const systemAuditEventSchema = z.object({
  id: z.uuid(),
  systemId: z.uuid(),
  actor: z.literal("local-user:unattributed"),
  operation: z.enum([
    "system.created",
    "system.updated",
    "system.archived",
    "system.domain_linked",
    "system.domain_unlinked",
    "system.project_linked",
    "system.project_unlinked",
    "system.resource_linked",
    "system.resource_unlinked",
  ]),
  details: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null()]),
  ),
  createdAt: z.iso.datetime({ offset: true }),
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
  version: z.number().int().min(1).optional(),
  domain: domainSummarySchema
    .pick({ id: true, name: true })
    .nullable()
    .optional(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const systemProjectConnectionSchema = z.object({
  system: systemSummarySchema,
  project: projectSummarySchema,
  link: systemProjectLinkSchema,
});

export const createProjectRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(4000).optional(),
  type: z.string().trim().min(1).max(100).optional(),
});

export const updateProjectRequestSchema = z.object({
  expectedVersion: z.number().int().min(1),
  name: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(4000).nullable(),
  type: z.string().trim().min(1).max(100),
  lifecycle: projectSummarySchema.shape.lifecycle,
});

export const projectMetadataSnapshotSchema = updateProjectRequestSchema
  .omit({ expectedVersion: true })
  .extend({ version: z.number().int().min(1) });

export const projectMetadataEventSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  version: z.number().int().min(2),
  actor: z.string().min(1),
  previous: projectMetadataSnapshotSchema,
  current: projectMetadataSnapshotSchema,
  changedFields: z
    .array(z.enum(["name", "summary", "type", "lifecycle"]))
    .min(1),
  createdAt: z.iso.datetime({ offset: true }),
});

export const listProjectMetadataEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  beforeVersion: z.coerce.number().int().min(2).optional(),
});

export const listProjectMetadataEventsResponseSchema = z.object({
  items: z.array(projectMetadataEventSchema),
  nextCursor: z.number().int().min(2).nullable(),
});

export const projectOverviewCardIdSchema = z.enum([
  "state",
  "work",
  "knowledge",
  "decisions",
  "systems",
  "resources",
  "activity",
  "attention",
]);

export const projectAreaIdSchema = z.enum([
  "systems",
  "resources",
  "metrics",
  "work",
  "knowledge",
  "decisions",
]);

const uniqueOverviewCardsSchema = z
  .array(projectOverviewCardIdSchema)
  .max(8)
  .refine((ids) => new Set(ids).size === ids.length);
const uniqueProjectAreasSchema = z
  .array(projectAreaIdSchema)
  .max(6)
  .refine((ids) => new Set(ids).size === ids.length);

export const projectPresentationSchema = z.object({
  version: z.number().int().min(1),
  overviewCards: uniqueOverviewCardsSchema,
  visibleAreas: uniqueProjectAreasSchema,
});

export const updateProjectPresentationRequestSchema = projectPresentationSchema
  .omit({ version: true })
  .extend({ expectedVersion: z.number().int().min(1) });

export const projectPresentationEventSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  version: z.number().int().min(2),
  actor: z.string().min(1),
  previous: projectPresentationSchema,
  current: projectPresentationSchema,
  createdAt: z.iso.datetime({ offset: true }),
});

export const listProjectPresentationEventsQuerySchema =
  listProjectMetadataEventsQuerySchema;
export const listProjectPresentationEventsResponseSchema = z.object({
  items: z.array(projectPresentationEventSchema),
  nextCursor: z.number().int().min(2).nullable(),
});

export const listResourcesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.uuid().optional(),
});

export const listWorkspaceRecordsQuerySchema = listResourcesQuerySchema.extend({
  projectId: z.uuid().optional(),
});

export const listWorkspaceWorkQuerySchema =
  listWorkspaceRecordsQuerySchema.extend({
    status: z.enum(["open", "done"]).optional(),
    priority: z.enum(["low", "normal", "high", "unset"]).optional(),
    assignee: z.enum(["unassigned", "local_user", "agent"]).optional(),
    due: z.enum(["overdue", "today", "upcoming", "undated"]).optional(),
    asOf: z.iso.date().optional(),
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

export const listDomainsQuerySchema = listResourcesQuerySchema.extend({
  lifecycle: z.enum(["active", "archived"]).optional(),
});

export const listDomainsResponseSchema = z.object({
  items: z.array(domainSummarySchema),
  nextCursor: z.uuid().nullable(),
});

export const listDomainProjectsResponseSchema = z.object({
  items: z.array(projectSummarySchema),
  nextCursor: z.uuid().nullable(),
});

export const listDomainAuditResponseSchema = z.object({
  items: z.array(domainAuditEventSchema),
  nextCursor: z.uuid().nullable(),
});

export const listSystemsQuerySchema = listResourcesQuerySchema.extend({
  lifecycle: z.enum(["active", "archived"]).optional(),
});

export const listSystemsResponseSchema = z.object({
  items: z.array(systemSummarySchema),
  nextCursor: z.uuid().nullable(),
});

export const listDomainSystemsResponseSchema = listSystemsResponseSchema;

export const listSystemProjectsResponseSchema = z.object({
  items: z.array(systemProjectConnectionSchema),
  nextCursor: z.uuid().nullable(),
});

export const listSystemResourcesResponseSchema = z.object({
  items: z.array(systemResourceConnectionSchema),
  nextCursor: z.uuid().nullable(),
});

export const listSystemAuditResponseSchema = z.object({
  items: z.array(systemAuditEventSchema),
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

export const captureFileMetadataSchema = z.object({
  originalName: z.string().min(1),
  mediaType: z.string().min(1),
  byteSize: z.number().int().min(1).max(2_097_152),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  downloadHref: z.string().startsWith("/api/v1/captures/"),
});

export const captureSchema = z.object({
  id: z.uuid(),
  inputType: z.enum(["text", "url", "file"]),
  originalContent: z.string(),
  file: captureFileMetadataSchema.nullable().optional(),
  source: z.enum(["manual-local", "automation-local-synthetic"]),
  author: z.enum(["local-user", "system:local-automation-worker"]),
  state: z.enum(["unfiled", "filed"]),
  projectId: z.uuid().nullable(),
  filedRecord: z
    .object({
      kind: z.enum(["task", "note", "link", "document"]),
      id: z.uuid(),
    })
    .nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  filedAt: z.iso.datetime({ offset: true }).nullable(),
});

export const localFileTextProjectionSchema = z.object({
  captureId: z.uuid(),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(["pending", "extracted", "unsupported", "failed"]),
  extractor: z.literal("local-utf8-v1"),
  extractedText: z.string().max(200_000).nullable(),
  truncated: z.boolean(),
  message: z.string().nullable(),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const localFileTextJobV1Schema = z.strictObject({
  version: z.literal(1),
  captureId: z.uuid(),
});

export const listCapturesResponseSchema = z.object({
  items: z.array(captureSchema),
  nextCursor: z.uuid().nullable(),
});

export const fileCaptureRequestSchema = z.object({
  projectId: z.uuid(),
  kind: z.enum(["task", "note", "link", "document"]),
  workType: z.enum(["task", "initiative"]).optional(),
  knowledgeType: z
    .enum([
      "note",
      "idea",
      "research",
      "requirement",
      "architecture_note",
      "runbook",
      "meeting_note",
      "lesson_learned",
      "instruction",
    ])
    .optional(),
  title: z.string().trim().min(1).max(200),
  body: z.string().max(20_000).optional(),
});

export const workItemSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  sourceCaptureId: z.uuid(),
  generatedFromWorkItemId: z.uuid().nullable().optional(),
  title: z.string(),
  description: z.string(),
  workType: z.enum(["task", "initiative", "subtask"]).optional(),
  assigneeKind: z.enum(["unassigned", "local_user", "agent"]).optional(),
  assigneeAgentId: z.uuid().nullable().optional(),
  assigneeLabel: z.string().nullable().optional(),
  status: z.enum(["open", "done"]),
  priority: z.enum(["low", "normal", "high"]).nullable().optional(),
  dueOn: z.iso.date().nullable().optional(),
  contextLink: z
    .object({
      id: z.uuid(),
      projectId: z.uuid(),
      createdAt: z.iso.datetime({ offset: true }),
    })
    .nullable()
    .optional(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const createWorkProjectLinkRequestSchema = z.strictObject({
  projectId: z.uuid(),
});

export const workProjectLinkSchema = z.object({
  id: z.uuid(),
  workItemId: z.uuid(),
  projectId: z.uuid(),
  type: z.literal("relates_to"),
  inverseType: z.literal("relates_to"),
  sourceKind: z.literal("work_item"),
  targetKind: z.literal("project"),
  lifecycle: z.enum(["active", "archived"]),
  provenance: z.literal("manual"),
  actor: z.literal("local-user:unattributed"),
  createdAt: z.iso.datetime({ offset: true }),
  archivedAt: z.iso.datetime({ offset: true }).nullable(),
});

export const workProjectConnectionSchema = z.object({
  link: workProjectLinkSchema,
  project: projectSummarySchema,
});

export const listWorkProjectConnectionsResponseSchema = z.object({
  items: z.array(workProjectConnectionSchema),
  nextCursor: z.uuid().nullable(),
});

export const workProjectAuditEventSchema = z.object({
  id: z.uuid(),
  workItemId: z.uuid(),
  projectId: z.uuid(),
  linkId: z.uuid(),
  operation: z.enum(["work.project_linked", "work.project_unlinked"]),
  actor: z.literal("local-user:unattributed"),
  createdAt: z.iso.datetime({ offset: true }),
});

export const listWorkProjectAuditResponseSchema = z.object({
  items: z.array(workProjectAuditEventSchema),
  nextCursor: z.uuid().nullable(),
});

export const changeWorkItemPlanningRequestSchema = z.strictObject({
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
  priority: z.enum(["low", "normal", "high"]).nullable(),
  dueOn: z.iso.date().nullable(),
});

export const changeWorkAssignmentRequestSchema = z.strictObject({
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
  assigneeKind: z.enum(["unassigned", "local_user", "agent"]),
  agentId: z.uuid().nullable(),
});

export const workItemAssignmentEventSchema = z.object({
  id: z.uuid(),
  workItemId: z.uuid(),
  previousKind: z.enum(["unassigned", "local_user", "agent"]),
  nextKind: z.enum(["unassigned", "local_user", "agent"]),
  previousAgentId: z.uuid().nullable(),
  nextAgentId: z.uuid().nullable(),
  previousLabel: z.string().nullable(),
  nextLabel: z.string().nullable(),
  actor: z.literal("local-user:unattributed"),
  createdAt: z.iso.datetime({ offset: true }),
});

export const listWorkAssignmentEventsResponseSchema = z.object({
  items: z.array(workItemAssignmentEventSchema),
  nextCursor: z.uuid().nullable(),
});

export const createWorkRecurrenceRequestSchema = z.strictObject({
  startAt: z.iso.datetime({ offset: true }),
  everyMinutes: z.number().int().min(5).max(10_080),
});

export const updateWorkRecurrenceRequestSchema =
  createWorkRecurrenceRequestSchema.extend({
    expectedUpdatedAt: z.iso.datetime({ offset: true }),
    enabled: z.boolean(),
  });

export const workRecurrenceDefinitionSchema = z.object({
  id: z.uuid(),
  sourceWorkItemId: z.uuid(),
  projectId: z.uuid(),
  startAt: z.iso.datetime({ offset: true }),
  everyMinutes: z.number().int(),
  nextOccurrenceAt: z.iso.datetime({ offset: true }),
  enabled: z.boolean(),
  sourceOfTruth: z.literal("local-only"),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const getWorkRecurrenceResponseSchema = z.object({
  definition: workRecurrenceDefinitionSchema.nullable(),
});

export const workRecurrenceOccurrenceSchema = z.object({
  id: z.uuid(),
  definitionId: z.uuid(),
  scheduledFor: z.iso.datetime({ offset: true }),
  state: z.enum(["queued", "running", "generated", "failed"]),
  generatedWorkItemId: z.uuid().nullable(),
  attempts: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
  sourceLabel: z.literal("Local worker-created task"),
  externalActions: z.array(z.never()).length(0),
  createdAt: z.iso.datetime({ offset: true }),
  completedAt: z.iso.datetime({ offset: true }).nullable(),
});

export const listWorkRecurrenceOccurrencesResponseSchema = z.object({
  items: z.array(workRecurrenceOccurrenceSchema),
  nextCursor: z.uuid().nullable(),
});

export const workRecurrenceAuditEventSchema = z.object({
  id: z.uuid(),
  definitionId: z.uuid(),
  occurrenceId: z.uuid().nullable(),
  operation: z.enum([
    "work.recurrence.created",
    "work.recurrence.updated",
    "work.recurrence.occurrence_queued",
    "work.recurrence.occurrences_skipped",
    "work.recurrence.attempt_started",
    "work.recurrence.occurrence_generated",
    "work.recurrence.attempt_failed",
  ]),
  actor: z.enum([
    "local-user:unattributed",
    "system:local-work-scheduler",
    "system:local-work-worker",
  ]),
  details: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime({ offset: true }),
});

export const listWorkRecurrenceAuditResponseSchema = z.object({
  items: z.array(workRecurrenceAuditEventSchema),
  nextCursor: z.uuid().nullable(),
});

export const workRecurrenceJobV1Schema = z.strictObject({
  version: z.literal(1),
  occurrenceId: z.uuid(),
  definitionId: z.uuid(),
});

export const localRecoveryDrillSchema = z.object({
  id: z.uuid(),
  environment: z.literal("local"),
  sourceLabel: z.literal("Local disposable PostgreSQL restore rehearsal"),
  outcome: z.enum(["passed", "failed"]),
  sourceSchemaTableCount: z.number().int().nonnegative(),
  restoredSchemaTableCount: z.number().int().nonnegative(),
  sourceCaptureSha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
  restoredCaptureSha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
  backupSha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
  errorCode: z.string().nullable(),
  startedAt: z.iso.datetime({ offset: true }),
  completedAt: z.iso.datetime({ offset: true }),
});

export const listLocalRecoveryDrillsResponseSchema = z.object({
  items: z.array(localRecoveryDrillSchema),
  nextCursor: z.uuid().nullable(),
});

export const listLocalRecoveryDrillsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.uuid().optional(),
});

export const localRecoveryStatusSchema = z.object({
  environment: z.literal("local"),
  localRehearsal: z.enum(["not_run", "passed", "failed"]),
  latestDrill: localRecoveryDrillSchema.nullable(),
  productionReady: z.literal(false),
  productionGates: z.array(
    z.object({
      code: z.enum([
        "vps_inventory",
        "offsite_backup_restore",
        "deployment_control",
        "human_sign_in_recovery",
      ]),
      status: z.literal("unverified"),
    }),
  ),
});

export const localBackupEvidenceSchema = z.object({
  id: z.uuid(),
  environment: z.literal("local"),
  sourceLabel: z.literal("Encrypted local PostgreSQL archive"),
  formatVersion: z.literal(1),
  outcome: z.enum(["passed", "failed"]),
  archiveSha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
  archiveBytes: z.number().int().nonnegative(),
  sourceSchemaTableCount: z.number().int().nonnegative(),
  restoredSchemaTableCount: z.number().int().nonnegative(),
  captureId: z.uuid().nullable(),
  sourceCaptureSha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
  restoredCaptureSha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
  errorCode: z.string().nullable(),
  startedAt: z.iso.datetime({ offset: true }),
  completedAt: z.iso.datetime({ offset: true }),
});

export const listLocalBackupsResponseSchema = z.object({
  items: z.array(localBackupEvidenceSchema),
  nextCursor: z.uuid().nullable(),
});

export const listLocalBackupsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.uuid().optional(),
});

export const localReleaseRehearsalSchema = z.object({
  id: z.uuid(),
  environment: z.literal("local"),
  sourceLabel: z.literal("Isolated local application rollback rehearsal"),
  outcome: z.enum(["passed", "failed"]),
  previousRevision: z
    .string()
    .regex(/^[0-9a-f]{40}$/)
    .nullable(),
  candidateRevision: z
    .string()
    .regex(/^[0-9a-f]{40}$/)
    .nullable(),
  previousImageId: z
    .string()
    .regex(/^sha256:[0-9a-f]{64}$/)
    .nullable(),
  candidateImageId: z
    .string()
    .regex(/^sha256:[0-9a-f]{64}$/)
    .nullable(),
  sourceSchemaTableCount: z.number().int().nonnegative(),
  isolatedSchemaTableCount: z.number().int().nonnegative(),
  sourceCaptureSha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
  isolatedCaptureSha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
  initialWebVerified: z.boolean(),
  initialWorkerVerified: z.boolean(),
  candidateWebVerified: z.boolean(),
  candidateWorkerVerified: z.boolean(),
  rollbackWebVerified: z.boolean(),
  rollbackWorkerVerified: z.boolean(),
  errorCode: z.string().nullable(),
  startedAt: z.iso.datetime({ offset: true }),
  completedAt: z.iso.datetime({ offset: true }),
});

export const listLocalReleaseRehearsalsResponseSchema = z.object({
  items: z.array(localReleaseRehearsalSchema),
  nextCursor: z.uuid().nullable(),
});

export const listLocalReleaseRehearsalsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.uuid().optional(),
});

export const workItemPlanningEventSchema = z.object({
  id: z.uuid(),
  workItemId: z.uuid(),
  previousPriority: z.enum(["low", "normal", "high"]).nullable(),
  nextPriority: z.enum(["low", "normal", "high"]).nullable(),
  previousDueOn: z.iso.date().nullable(),
  nextDueOn: z.iso.date().nullable(),
  actor: z.literal("local-user:unattributed"),
  createdAt: z.iso.datetime({ offset: true }),
});

export const listWorkItemPlanningEventsResponseSchema = z.object({
  items: z.array(workItemPlanningEventSchema),
  nextCursor: z.uuid().nullable(),
});

export const listUpcomingWorkResponseSchema = z.object({
  items: z.array(workItemSchema),
  nextCursor: z.uuid().nullable(),
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

export const createWorkItemCommentRequestSchema = z.strictObject({
  body: z.string().trim().min(1).max(5_000),
});

export const workItemCommentSchema = z.object({
  id: z.uuid(),
  workItemId: z.uuid(),
  projectId: z.uuid(),
  body: z.string().min(1),
  actor: z.literal("local-user:unattributed"),
  sourceLabel: z.literal("Manual local work comment"),
  createdAt: z.iso.datetime({ offset: true }),
});

export const listWorkItemCommentsResponseSchema = z.object({
  items: z.array(workItemCommentSchema),
  nextCursor: z.uuid().nullable(),
});

export const createWorkItemRelationRequestSchema = z.strictObject({
  sourceWorkItemId: z.uuid(),
  targetWorkItemId: z.uuid(),
  type: z.enum(["parent_of", "blocks"]),
});

export const workItemRelationSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  sourceWorkItemId: z.uuid(),
  sourceTitle: z.string(),
  sourceStatus: z.enum(["open", "done"]),
  targetWorkItemId: z.uuid(),
  targetTitle: z.string(),
  targetStatus: z.enum(["open", "done"]),
  type: z.enum(["parent_of", "blocks"]),
  state: z.enum(["active", "archived"]),
  sourceLabel: z.literal("Manual local work relationship"),
  createdAt: z.iso.datetime({ offset: true }),
  archivedAt: z.iso.datetime({ offset: true }).nullable(),
});

export const listWorkItemRelationsQuerySchema = z.object({
  direction: z.enum(["outgoing", "incoming"]),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.uuid().optional(),
});

export const listWorkItemRelationsResponseSchema = z.object({
  items: z.array(workItemRelationSchema),
  nextCursor: z.uuid().nullable(),
});

export const createWorkItemAttachmentRequestSchema = z.strictObject({
  knowledgeItemId: z.uuid(),
});

export const workItemAttachmentSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  workItemId: z.uuid(),
  workTitle: z.string(),
  knowledgeItemId: z.uuid(),
  contextLinkId: z.uuid().nullable(),
  documentTitle: z.string(),
  sourceCaptureId: z.uuid(),
  originalName: z.string(),
  byteSize: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  downloadHref: z.string().startsWith("/api/v1/captures/"),
  type: z.literal("attached_document"),
  inverseType: z.literal("attached_to_work"),
  state: z.enum(["active", "archived"]),
  actor: z.literal("local-user:unattributed"),
  sourceLabel: z.literal("Manual local work attachment"),
  createdAt: z.iso.datetime({ offset: true }),
  archivedAt: z.iso.datetime({ offset: true }).nullable(),
});

export const listWorkItemAttachmentsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.uuid().optional(),
});

export const listWorkItemAttachmentsResponseSchema = z.object({
  items: z.array(workItemAttachmentSchema),
  nextCursor: z.uuid().nullable(),
});

export const workItemAcceptanceSchema = z.object({
  workItemId: z.uuid(),
  criteria: z.string(),
  version: z.number().int().min(0),
  updatedAt: z.iso.datetime({ offset: true }).nullable(),
});

export const saveWorkItemAcceptanceRequestSchema = z.strictObject({
  expectedVersion: z.number().int().min(0),
  criteria: z.string().trim().max(10_000),
});

export const workItemAcceptanceRevisionSchema = z.object({
  id: z.uuid(),
  workItemId: z.uuid(),
  version: z.number().int().positive(),
  criteria: z.string(),
  actor: z.literal("local-user:unattributed"),
  createdAt: z.iso.datetime({ offset: true }),
});

export const listWorkItemAcceptanceRevisionsResponseSchema = z.object({
  items: z.array(workItemAcceptanceRevisionSchema),
  nextCursor: z.uuid().nullable(),
});

export const createWorkItemVerificationRequestSchema = z.strictObject({
  expectedAcceptanceVersion: z.number().int().positive(),
  attachmentId: z.uuid(),
  result: z.enum(["met", "not_met"]),
  note: z.string().trim().min(1).max(5_000),
});

export const workItemVerificationSchema = z.object({
  id: z.uuid(),
  workItemId: z.uuid(),
  acceptanceVersion: z.number().int().positive(),
  attachmentId: z.uuid(),
  documentTitle: z.string(),
  sourceCaptureId: z.uuid(),
  downloadHref: z.string().startsWith("/api/v1/"),
  result: z.enum(["met", "not_met"]),
  note: z.string(),
  actor: z.literal("local-user:unattributed"),
  sourceLabel: z.literal("Manual local acceptance review"),
  createdAt: z.iso.datetime({ offset: true }),
});

export const listWorkItemVerificationsResponseSchema = z.object({
  items: z.array(workItemVerificationSchema),
  nextCursor: z.uuid().nullable(),
});

export const knowledgeItemSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  sourceCaptureId: z.uuid(),
  kind: z.enum([
    "note",
    "idea",
    "research",
    "requirement",
    "architecture_note",
    "runbook",
    "meeting_note",
    "lesson_learned",
    "instruction",
    "link",
    "document",
  ]),
  title: z.string(),
  content: z.string(),
  url: z.url().nullable().optional(),
  version: z.number().int().positive().optional(),
  contextLink: z
    .object({
      id: z.uuid(),
      projectId: z.uuid(),
      createdAt: z.iso.datetime({ offset: true }),
    })
    .nullable()
    .optional(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const listWorkspaceKnowledgeQuerySchema =
  listWorkspaceRecordsQuerySchema.extend({
    kind: knowledgeItemSchema.shape.kind.optional(),
  });

export const savedViewDefinitionSchema = z.discriminatedUnion("surface", [
  z.strictObject({
    surface: z.literal("work"),
    projectId: z.uuid().nullable(),
    presentation: z.enum(["list", "board"]),
    status: z.enum(["all", "open", "done"]),
    priority: z.enum(["all", "low", "normal", "high", "unset"]),
    assignee: z.enum(["all", "unassigned", "local_user", "agent"]),
    due: z.enum(["all", "overdue", "today", "upcoming", "undated"]),
  }),
  z.strictObject({
    surface: z.literal("knowledge"),
    projectId: z.uuid().nullable(),
    kind: z.union([z.literal("all"), knowledgeItemSchema.shape.kind]),
  }),
]);

export const createSavedViewRequestSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  definition: savedViewDefinitionSchema,
});

export const updateSavedViewRequestSchema = createSavedViewRequestSchema.extend(
  {
    expectedVersion: z.number().int().positive(),
  },
);

export const archiveSavedViewRequestSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
});

export const savedViewSchema = createSavedViewRequestSchema.extend({
  id: z.uuid(),
  surface: z.enum(["work", "knowledge"]),
  version: z.number().int().positive(),
  actor: z.literal("local-user:unattributed"),
  lifecycle: z.enum(["active", "archived"]),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  archivedAt: z.iso.datetime({ offset: true }).nullable(),
});

export const listSavedViewsQuerySchema = listResourcesQuerySchema.extend({
  surface: z.enum(["work", "knowledge"]),
});

export const listSavedViewsResponseSchema = z.object({
  items: z.array(savedViewSchema),
  nextCursor: z.uuid().nullable(),
});

export const savedViewAuditEventSchema = z.object({
  id: z.uuid(),
  savedViewId: z.uuid(),
  actor: z.literal("local-user:unattributed"),
  operation: z.enum(["created", "updated", "archived"]),
  version: z.number().int().positive(),
  name: z.string(),
  definition: savedViewDefinitionSchema,
  createdAt: z.iso.datetime({ offset: true }),
});

export const listSavedViewAuditResponseSchema = z.object({
  items: z.array(savedViewAuditEventSchema),
  nextCursor: z.uuid().nullable(),
});

export const createKnowledgeProjectLinkRequestSchema = z.strictObject({
  projectId: z.uuid(),
});

export const knowledgeProjectLinkSchema = z.object({
  id: z.uuid(),
  knowledgeItemId: z.uuid(),
  projectId: z.uuid(),
  type: z.literal("relates_to"),
  inverseType: z.literal("relates_to"),
  sourceKind: z.literal("knowledge_item"),
  targetKind: z.literal("project"),
  lifecycle: z.enum(["active", "archived"]),
  provenance: z.literal("manual"),
  actor: z.literal("local-user:unattributed"),
  createdAt: z.iso.datetime({ offset: true }),
  archivedAt: z.iso.datetime({ offset: true }).nullable(),
});

export const knowledgeProjectConnectionSchema = z.object({
  link: knowledgeProjectLinkSchema,
  project: projectSummarySchema,
});

export const listKnowledgeProjectConnectionsResponseSchema = z.object({
  items: z.array(knowledgeProjectConnectionSchema),
  nextCursor: z.uuid().nullable(),
});

export const knowledgeProjectAuditEventSchema = z.object({
  id: z.uuid(),
  knowledgeItemId: z.uuid(),
  projectId: z.uuid(),
  linkId: z.uuid(),
  operation: z.enum(["knowledge.project_linked", "knowledge.project_unlinked"]),
  actor: z.literal("local-user:unattributed"),
  createdAt: z.iso.datetime({ offset: true }),
});

export const listKnowledgeProjectAuditResponseSchema = z.object({
  items: z.array(knowledgeProjectAuditEventSchema),
  nextCursor: z.uuid().nullable(),
});

export const reviseKnowledgeItemRequestSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  content: z.string().max(20_000),
});

export const knowledgeItemRevisionSchema = z.object({
  id: z.uuid(),
  knowledgeItemId: z.uuid(),
  version: z.number().int().positive(),
  previousTitle: z.string(),
  previousContent: z.string(),
  title: z.string(),
  content: z.string(),
  actor: z.literal("local-user:unattributed"),
  createdAt: z.iso.datetime({ offset: true }),
});

export const listKnowledgeItemRevisionsResponseSchema = z.object({
  items: z.array(knowledgeItemRevisionSchema),
  nextCursor: z.uuid().nullable(),
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

export const workspaceWorkItemSchema = workItemSchema.extend({
  projectName: z.string().min(1),
});

export const listWorkspaceWorkResponseSchema = z.object({
  items: z.array(workspaceWorkItemSchema),
  nextCursor: z.uuid().nullable(),
});

export const listKnowledgeItemsResponseSchema = z.object({
  items: z.array(knowledgeItemSchema),
  nextCursor: z.uuid().nullable(),
});

export const workspaceKnowledgeItemSchema = knowledgeItemSchema.extend({
  projectName: z.string().min(1),
});

export const listWorkspaceKnowledgeResponseSchema = z.object({
  items: z.array(workspaceKnowledgeItemSchema),
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

export const workspaceDecisionSchema = projectDecisionSchema.extend({
  projectName: z.string().min(1),
});

export const listWorkspaceDecisionsResponseSchema = z.object({
  items: z.array(workspaceDecisionSchema),
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
  localAction: z
    .strictObject({
      kind: z.literal("create_project_note"),
      capabilityReference: z.literal("commandry.project.knowledge.create"),
    })
    .optional(),
  recurrence: z
    .strictObject({
      startAt: z.iso.datetime({ offset: true }),
      everyMinutes: z.number().int().min(5).max(10_080),
    })
    .optional(),
  eventType: z
    .enum(["git.pull_request.merged", "monitor.down", "monitor.recovered"])
    .optional(),
  condition: z
    .strictObject({
      resourceId: z.uuid(),
      metricName: z.literal("external_availability"),
      operator: z.literal("lte"),
      thresholdPercent: z.number().int().min(0).max(99),
    })
    .optional(),
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
  localAction: z
    .object({
      kind: z.literal("create_project_note"),
      capabilityReference: z.literal("commandry.project.knowledge.create"),
      risk: z.literal("reversible"),
      approvalBehavior: z.literal("definition_opt_in_local_only"),
    })
    .nullable(),
  routine: z.literal("local_project_summary_v1"),
  triggerType: z.enum([
    "on_creation_once",
    "recurring_interval",
    "synthetic_event",
    "synthetic_condition",
  ]),
  eventType: z
    .enum(["git.pull_request.merged", "monitor.down", "monitor.recovered"])
    .nullable(),
  condition: z
    .object({
      resourceId: z.uuid(),
      metricName: z.literal("external_availability"),
      operator: z.literal("lte"),
      thresholdPercent: z.number().int().min(0).max(99),
    })
    .nullable()
    .optional(),
  enabled: z.boolean(),
  sourceOfTruth: z.literal("local-only"),
  recurrenceStartAt: z.iso.datetime({ offset: true }).nullable(),
  recurrenceEveryMinutes: z.number().int().min(5).max(10_080).nullable(),
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
  kind: z.enum([
    "capture",
    "task",
    "initiative",
    "subtask",
    "note",
    "idea",
    "research",
    "requirement",
    "architecture_note",
    "runbook",
    "meeting_note",
    "lesson_learned",
    "instruction",
    "link",
    "document",
    "comment",
    "decision",
    "domain",
    "system",
    "project",
    "resource",
  ]),
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

export const localIntegrationKindSchema = syntheticSourceKindSchema;

export const createLocalIntegrationRequestSchema = z.strictObject({
  name: z.string().trim().min(1).max(160),
  kind: localIntegrationKindSchema,
  projectId: z.uuid(),
  resourceId: z.uuid().nullable(),
});

export const setLocalIntegrationEnabledRequestSchema = z.strictObject({
  enabled: z.boolean(),
});

export const setLocalIntegrationFreshnessRequestSchema = z.strictObject({
  windowMinutes: z.number().int().min(1).max(10080),
});

export const runLocalIntegrationSampleRequestSchema = z.strictObject({
  scenarioId: syntheticScenarioIdSchema,
  occurrenceId: z.string().trim().min(1).max(180),
  occurredAt: z.iso.datetime({ offset: true }).optional(),
});

export const localConnectorTokenSchema = z.object({
  token: z.string().min(32),
  issuedAt: z.iso.datetime({ offset: true }),
  notice: z.literal("Local synthetic receiver token; shown once"),
});

export const localConnectorFeedItemSchema = z.object({
  id: z.uuid(),
  integrationInstanceId: z.uuid(),
  scenarioId: syntheticScenarioIdSchema,
  occurrenceId: z.string(),
  occurredAt: z.iso.datetime({ offset: true }).nullable(),
  state: z.enum(["queued", "processing", "submitted", "failed"]),
  importId: z.uuid().nullable(),
  error: z.string().nullable(),
  attempts: z.number().int().nonnegative(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  isSynthetic: z.literal(true),
});

export const listLocalConnectorFeedResponseSchema = z.object({
  items: z.array(localConnectorFeedItemSchema),
  nextCursor: z.uuid().nullable(),
});

export const localIntegrationSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: localIntegrationKindSchema,
  projectId: z.uuid(),
  projectName: z.string(),
  resourceId: z.uuid().nullable(),
  resourceName: z.string().nullable(),
  enabled: z.boolean(),
  adapterMode: z.literal("local_fixture"),
  isSynthetic: z.literal(true),
  receiverConfigured: z.boolean(),
  freshnessWindowMinutes: z.number().int().min(1).max(10080),
  freshnessState: z.enum(["unknown", "fresh", "stale", "future"]),
  lastObservedAt: z.iso.datetime({ offset: true }).nullable(),
  lastReceivedAt: z.iso.datetime({ offset: true }).nullable(),
  observationEvidenceHref: z
    .string()
    .startsWith("/api/v1/source-envelopes/")
    .nullable(),
  lastAttemptAt: z.iso.datetime({ offset: true }).nullable(),
  lastSuccessAt: z.iso.datetime({ offset: true }).nullable(),
  lastError: z.string().nullable(),
  nextAttemptAt: z.null(),
  cursor: z.null(),
  latestImportId: z.uuid().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const listLocalIntegrationsQuerySchema = listResourcesQuerySchema.extend(
  {
    projectId: z.uuid().optional(),
    resourceId: z.uuid().optional(),
  },
);

export const listLocalIntegrationsResponseSchema = z.object({
  items: z.array(localIntegrationSchema),
  nextCursor: z.uuid().nullable(),
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
  integrationInstanceId: z.uuid().nullable(),
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

export const listSyntheticEventImportsQuerySchema =
  listResourcesQuerySchema.extend({
    integrationInstanceId: z.uuid().optional(),
  });

export const syntheticFlowReplayStageSchema = z.object({
  id: z.string().min(1),
  kind: z.enum([
    "import_queued",
    "source_received",
    "attempt_started",
    "attempt_completed",
    "event_projected",
    "metric_projected",
    "alert_evidence",
    "import_completed",
    "automation_queued",
  ]),
  title: z.string().min(1),
  detail: z.string().min(1),
  recordedAt: z.iso.datetime({ offset: true }),
  occurredAt: z.iso.datetime({ offset: true }).nullable(),
  href: z.string().startsWith("/").nullable(),
  isSynthetic: z.literal(true),
});
export const syntheticFlowReplayQuerySchema = listResourcesQuerySchema;
export const syntheticFlowReplaySchema = z.object({
  mode: z.literal("historical_replay"),
  importId: z.uuid(),
  projectId: z.uuid(),
  scenarioId: syntheticScenarioIdSchema,
  importState: z.enum(["queued", "running", "succeeded", "failed"]),
  sourceLabel: syntheticSourceLabelSchema,
  generatedAt: z.iso.datetime({ offset: true }),
  stages: z.array(syntheticFlowReplayStageSchema),
  nextCursor: z.uuid().nullable(),
  isSynthetic: z.literal(true),
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

export const syntheticMetricSampleSchema = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
  projectId: z.uuid(),
  resourceId: z.uuid(),
  resourceName: z.string().min(1),
  name: z.literal("external_availability"),
  unit: z.literal("percent"),
  value: z.number().int().min(0).max(100),
  sampledAt: z.iso.datetime({ offset: true }),
  recordedAt: z.iso.datetime({ offset: true }),
  sourceEnvelopeId: z.uuid(),
  evidenceHref: z.string().startsWith("/api/v1/source-envelopes/"),
  sourceLabel: z.literal("Synthetic operational fixture"),
  isSynthetic: z.literal(true),
});

export const listSyntheticMetricsQuerySchema = listResourcesQuerySchema.extend({
  projectId: z.uuid().optional(),
  resourceId: z.uuid().optional(),
});

export const listSyntheticMetricsResponseSchema = z.object({
  items: z.array(syntheticMetricSampleSchema),
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

export const localAttentionSettingsSchema = z.object({
  version: z.number().int().min(0),
  staleSourceEnabled: z.boolean(),
  metricDropEnabled: z.boolean(),
  metricDropPoints: z.number().int().min(1).max(100),
  updatedAt: z.iso.datetime({ offset: true }).nullable(),
  sourceLabel: z.literal("Local attention rules"),
});

export const updateLocalAttentionSettingsRequestSchema = z.strictObject({
  expectedVersion: z.number().int().min(0),
  staleSourceEnabled: z.boolean(),
  metricDropEnabled: z.boolean(),
  metricDropPoints: z.number().int().min(1).max(100),
});

export const localAttentionSignalSchema = z.object({
  id: z.uuid(),
  key: z.string().min(1),
  ruleId: z.enum(["source_stale", "metric_drop"]),
  state: z.enum(["active", "resolved"]),
  projectId: z.uuid(),
  projectName: z.string(),
  integrationId: z.uuid().nullable(),
  integrationName: z.string().nullable(),
  resourceId: z.uuid().nullable(),
  resourceName: z.string().nullable(),
  evidenceHref: z.string().startsWith("/api/v1/"),
  previousEvidenceHref: z.string().startsWith("/api/v1/").nullable(),
  reason: z.string().min(1),
  observedAt: z.iso.datetime({ offset: true }),
  previousObservedAt: z.iso.datetime({ offset: true }).nullable(),
  previousValue: z.number().int().nullable(),
  latestValue: z.number().int().nullable(),
  threshold: z.number().int().min(1),
  changedAt: z.iso.datetime({ offset: true }),
  evaluatedAt: z.iso.datetime({ offset: true }),
  sourceLabel: z.literal("Synthetic local attention"),
  isSynthetic: z.literal(true),
  realHealth: z.literal("unknown"),
});

export const listLocalAttentionSignalsQuerySchema =
  listResourcesQuerySchema.extend({
    projectId: z.uuid().optional(),
    view: z.enum(["active", "all"]).default("active"),
  });

export const listLocalAttentionSignalsResponseSchema = z.object({
  items: z.array(localAttentionSignalSchema),
  nextCursor: z.uuid().nullable(),
});

export const localAttentionAuditEventSchema = z.object({
  id: z.uuid(),
  signalId: z.uuid().nullable(),
  actor: z.string(),
  operation: z.string(),
  details: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null()]),
  ),
  createdAt: z.iso.datetime({ offset: true }),
});

export const listLocalAttentionAuditResponseSchema = z.object({
  items: z.array(localAttentionAuditEventSchema),
  nextCursor: z.uuid().nullable(),
});

export const evidenceReferenceSchema = z.object({
  kind: z.enum([
    "domain",
    "project_domain_link",
    "system",
    "system_project_link",
    "system_domain_link",
    "system_resource_link",
    "project",
    "work_item",
    "work_item_assignment_event",
    "work_recurrence_occurrence",
    "work_item_relation",
    "work_item_attachment",
    "work_item_acceptance_revision",
    "work_item_verification",
    "metric_sample",
    "knowledge_item",
    "knowledge_project_link",
    "work_project_link",
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
  localAction: z
    .object({
      kind: z.literal("create_project_note"),
      capabilityReference: z.literal("commandry.project.knowledge.create"),
      risk: z.literal("reversible"),
      approvalBehavior: z.literal("definition_opt_in_local_only"),
      captureId: z.uuid(),
      recordId: z.uuid(),
      href: z.string().startsWith("/knowledge-items/"),
    })
    .optional(),
});
export const automationRunSchema = z.object({
  id: z.uuid(),
  definitionId: z.uuid(),
  projectId: z.uuid(),
  occurrenceId: z.uuid(),
  trigger: z.enum([
    "on_creation",
    "manual",
    "scheduled",
    "recurring",
    "synthetic_event",
    "synthetic_condition",
  ]),
  sourceEventId: z.uuid().nullable(),
  sourceMetricSampleId: z.uuid().nullable().optional(),
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
export const automationEvidenceCheckSchema = z.object({
  id: z.uuid(),
  runId: z.uuid(),
  status: z.enum(["complete", "missing"]),
  evidenceCount: z.number().int().min(1),
  missing: z.array(
    z.object({ kind: evidenceReferenceSchema.shape.kind, id: z.uuid() }),
  ),
  resultDigest: z.string().length(64),
  actor: z.literal("local-user:unattributed"),
  checkedAt: z.iso.datetime({ offset: true }),
  scope: z.literal("reference_presence_only"),
  isSynthetic: z.literal(true),
});
export const listAutomationEvidenceChecksResponseSchema = z.object({
  items: z.array(automationEvidenceCheckSchema),
  nextCursor: z.uuid().nullable(),
});
export const automationExportPageSchema = z.object({
  exportVersion: z.literal(1),
  sourceOfTruth: z.literal("local-only"),
  isSynthetic: z.literal(true),
  exportedAt: z.iso.datetime({ offset: true }),
  definition: automationDefinitionSchema,
  runs: z.array(automationRunSchema),
  nextCursor: z.uuid().nullable(),
});
export const morningDigestQuerySchema = z.strictObject({
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
  projectId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).max(100).optional(),
});
export const morningDigestItemSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["automation", "agent"]),
  projectId: z.uuid(),
  title: z.string().min(1),
  actorLabel: z.string().min(1),
  state: z.enum(["succeeded", "failed", "skipped"]),
  outcome: z.enum(["awaiting_review", "failed", "skipped"]),
  summary: z.string().min(1),
  completedAt: z.iso.datetime({ offset: true }),
  href: z.string().startsWith("/"),
  evidenceHref: z.string().startsWith("/api/v1/"),
  sourceEvidenceHref: z.string().startsWith("/api/v1/").nullable(),
  sourceLabel: z.enum([
    "Synthetic local automation",
    "Synthetic local agent",
    "Synthetic local overnight queue",
  ]),
  queueHref: z.string().startsWith("/").nullable().optional(),
  isSynthetic: z.literal(true),
  verificationStatus: z.literal("unverified"),
});
export const morningDigestResponseSchema = z.object({
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
  items: z.array(morningDigestItemSchema),
  nextCursor: z.string().nullable(),
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
    "system",
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

export const recordingStatusSchema = z.object({
  status: z.enum(["not_recorded", "recorded"]),
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
    systems: briefSectionSchema.optional(),
    resources: briefSectionSchema,
    activity: briefSectionSchema,
    attention: briefSectionSchema,
  }),
  missing: z.object({
    questions: notRecordedSchema,
    blockers: notRecordedSchema,
    acceptanceCriteria: recordingStatusSchema,
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
    workType: z.enum(["task", "initiative", "subtask"]).optional(),
    assignee: z
      .object({
        kind: z.enum(["local_user", "agent"]),
        agentId: z.uuid().nullable(),
        label: z.string().min(1),
        evidence: evidenceReferenceSchema,
      })
      .optional(),
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
      kind: knowledgeItemSchema.shape.kind.optional(),
      evidence: evidenceReferenceSchema,
      contextEvidence: evidenceReferenceSchema.optional(),
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
  acceptance: z
    .object({
      criteria: z.string().min(1),
      version: z.number().int().positive(),
      evidence: evidenceReferenceSchema,
      latestReview: z
        .object({
          result: z.enum(["met", "not_met"]),
          note: z.string(),
          documentTitle: z.string(),
          evidence: z.array(evidenceReferenceSchema).min(2),
        })
        .nullable(),
    })
    .nullable()
    .optional(),
  missing: z.object({
    acceptanceCriteria: recordingStatusSchema,
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

export const listProjectEligibleAgentsResponseSchema =
  listLocalAgentsResponseSchema;

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

export const localAgentCallbackRequestSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    version: z.literal(1),
    attemptId: z.uuid(),
    sequence: z.number().int().positive(),
    kind: z.literal("heartbeat"),
    stage: z.enum(["started", "brief_read", "work_read", "result_prepared"]),
  }),
  z.strictObject({
    version: z.literal(1),
    attemptId: z.uuid(),
    sequence: z.number().int().positive(),
    kind: z.literal("artifact"),
    artifactName: z.literal("synthetic-run-report.json"),
    artifactMimeType: z.literal("application/json"),
    artifactContent: z.string().min(1).max(16_384),
  }),
]);

export const localAgentCallbackEventSchema = z.object({
  id: z.uuid(),
  runId: z.uuid(),
  attemptId: z.uuid(),
  sequence: z.number().int().positive(),
  kind: z.enum(["heartbeat", "artifact"]),
  stage: z
    .enum(["started", "brief_read", "work_read", "result_prepared"])
    .nullable(),
  artifactName: z.literal("synthetic-run-report.json").nullable(),
  artifactMimeType: z.literal("application/json").nullable(),
  artifactBytes: z.number().int().min(1).max(16_384).nullable(),
  artifactSha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
  sourceLabel: z.literal("Synthetic local runner callback"),
  isSynthetic: z.literal(true),
  createdAt: z.iso.datetime({ offset: true }),
});

export const listLocalAgentCallbacksResponseSchema = z.object({
  items: z.array(localAgentCallbackEventSchema),
  nextCursor: z.uuid().nullable(),
});

export const listLocalAgentCallbacksQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.uuid().optional(),
});

export const createOvernightQueueEntryRequestSchema = z.strictObject({
  packetId: z.uuid(),
  agentId: z.uuid(),
  runAfter: z.iso.datetime({ offset: true }),
});

export const overnightQueueEntrySchema = z.object({
  id: z.uuid(),
  packetId: z.uuid(),
  packetVersion: z.number().int().min(1),
  packetDigest: z.string().regex(/^[a-f0-9]{64}$/),
  projectId: z.uuid(),
  projectName: z.string().min(1),
  workItemId: z.uuid(),
  workTitle: z.string().min(1),
  agentId: z.uuid(),
  agentName: z.string().min(1),
  runAfter: z.iso.datetime({ offset: true }),
  state: z.enum([
    "scheduled",
    "dispatching",
    "dispatched",
    "blocked",
    "canceled",
  ]),
  runId: z.uuid().nullable(),
  runState: z
    .enum(["queued", "running", "succeeded", "failed", "canceled"])
    .nullable(),
  blockedReason: z.string().nullable(),
  sourceLabel: z.literal("Synthetic local overnight queue"),
  isSynthetic: z.literal(true),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const listOvernightQueueQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.uuid().optional(),
  projectId: z.uuid().optional(),
});

export const listOvernightQueueResponseSchema = z.object({
  items: z.array(overnightQueueEntrySchema),
  nextCursor: z.uuid().nullable(),
});

export const overnightReadinessQuerySchema = z.object({
  packetId: z.uuid(),
  agentId: z.uuid(),
});

export const overnightReadinessSchema = z.object({
  ready: z.boolean(),
  checks: z.array(
    z.object({ key: z.string(), ok: z.boolean(), message: z.string() }),
  ),
  warnings: z.array(z.string()),
  sourceLabel: z.literal("Synthetic local overnight queue"),
});

export const overnightQueueJobV1Schema = z.strictObject({
  version: z.literal(1),
  entryId: z.uuid(),
});

export const overnightQueueAuditEventSchema = z.object({
  id: z.uuid(),
  entryId: z.uuid(),
  actor: z.string().min(1),
  operation: z.string().min(1),
  details: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null()]),
  ),
  createdAt: z.iso.datetime({ offset: true }),
});

export const listOvernightQueueAuditResponseSchema = z.object({
  items: z.array(overnightQueueAuditEventSchema),
  nextCursor: z.uuid().nullable(),
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
  state: z.enum(["running", "succeeded", "failed", "canceled"]),
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
  state: z.enum(["queued", "running", "succeeded", "failed", "canceled"]),
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

export const createLocalMcpSessionRequestSchema = z.strictObject({
  packetId: z.uuid(),
  agentId: z.uuid(),
});

export const localMcpSessionSchema = z.object({
  id: z.uuid(),
  packetId: z.uuid(),
  packetVersion: z.number().int().min(1),
  packetDigest: z.string().regex(/^[a-f0-9]{64}$/),
  agentId: z.uuid(),
  projectId: z.uuid(),
  workItemId: z.uuid(),
  operations: z.tuple([
    z.literal("project.brief.read"),
    z.literal("work.read"),
  ]),
  expiresAt: z.iso.datetime({ offset: true }),
  revokedAt: z.iso.datetime({ offset: true }).nullable(),
  sourceLabel: z.literal("Local read-only MCP preview"),
  createdAt: z.iso.datetime({ offset: true }),
});

export const createdLocalMcpSessionSchema = localMcpSessionSchema.extend({
  token: z.string().startsWith("mcp_").min(30),
  endpoint: z.literal("/mcp"),
});

export const listLocalMcpSessionsQuerySchema = z.object({
  packetId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.uuid().optional(),
});

export const listLocalMcpSessionsResponseSchema = z.object({
  items: z.array(localMcpSessionSchema),
  nextCursor: z.uuid().nullable(),
});

export const localMcpReadRequestSchema = z.strictObject({
  operation: localAgentReadOperationSchema,
  projectId: z.uuid(),
  workItemId: z.uuid().optional(),
  reason: z.string().trim().min(1).max(500),
});

export const localMcpReadResponseSchema = z.object({
  sessionId: z.uuid(),
  projectId: z.uuid(),
  operation: localAgentReadOperationSchema,
  readAt: z.iso.datetime({ offset: true }),
  auditId: z.uuid(),
  sensitivity: z.literal("unclassified-local-data"),
  source: agentContextReadSourceSchema,
});

export const localMcpAuditEventSchema = z.object({
  id: z.uuid(),
  sessionId: z.uuid(),
  actor: z.enum([
    "local-mcp-client:unattributed",
    "local-reviewer:unattributed",
  ]),
  operation: z.string().min(1),
  decision: z.enum(["allowed", "denied"]),
  code: z.string().min(1),
  reason: z.string().min(1),
  createdAt: z.iso.datetime({ offset: true }),
});

export const listLocalMcpAuditResponseSchema = z.object({
  items: z.array(localMcpAuditEventSchema),
  nextCursor: z.uuid().nullable(),
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
  stage: z.enum(["brief_read", "work_read", "result_prepared"]).nullable(),
  attemptId: z.uuid().nullable(),
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
export type DomainSummary = z.infer<typeof domainSummarySchema>;
export type CreateDomainRequest = z.infer<typeof createDomainRequestSchema>;
export type UpdateDomainRequest = z.infer<typeof updateDomainRequestSchema>;
export type ArchiveDomainRequest = z.infer<typeof archiveDomainRequestSchema>;
export type SetProjectDomainRequest = z.infer<
  typeof setProjectDomainRequestSchema
>;
export type DomainAuditEvent = z.infer<typeof domainAuditEventSchema>;
export type ProjectDomainLink = z.infer<typeof projectDomainLinkSchema>;
export type ProjectDomainMembership = z.infer<
  typeof projectDomainMembershipSchema
>;
export type SystemSummary = z.infer<typeof systemSummarySchema>;
export type CreateSystemRequest = z.infer<typeof createSystemRequestSchema>;
export type UpdateSystemRequest = z.infer<typeof updateSystemRequestSchema>;
export type ArchiveSystemRequest = z.infer<typeof archiveSystemRequestSchema>;
export type SetSystemDomainRequest = z.infer<
  typeof setSystemDomainRequestSchema
>;
export type SystemDomainLink = z.infer<typeof systemDomainLinkSchema>;
export type SystemProjectLink = z.infer<typeof systemProjectLinkSchema>;
export type SystemResourceLink = z.infer<typeof systemResourceLinkSchema>;
export type SystemDomainMembership = z.infer<
  typeof systemDomainMembershipSchema
>;
export type SystemProjectConnection = z.infer<
  typeof systemProjectConnectionSchema
>;
export type SystemResourceConnection = z.infer<
  typeof systemResourceConnectionSchema
>;
export type SystemAuditEvent = z.infer<typeof systemAuditEventSchema>;
export type ProjectResourceLink = z.infer<typeof projectResourceLinkSchema>;
export type ProjectResourceLinkDetail = z.infer<
  typeof projectResourceLinkDetailSchema
>;
export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;
export type UpdateProjectRequest = z.infer<typeof updateProjectRequestSchema>;
export type ProjectMetadataEvent = z.infer<typeof projectMetadataEventSchema>;
export type ProjectPresentation = z.infer<typeof projectPresentationSchema>;
export type UpdateProjectPresentationRequest = z.infer<
  typeof updateProjectPresentationRequestSchema
>;
export type ProjectPresentationEvent = z.infer<
  typeof projectPresentationEventSchema
>;
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
export type LocalFileTextProjection = z.infer<
  typeof localFileTextProjectionSchema
>;
export type FileCaptureRequest = z.infer<typeof fileCaptureRequestSchema>;
export type WorkItem = z.infer<typeof workItemSchema>;
export type WorkProjectLink = z.infer<typeof workProjectLinkSchema>;
export type WorkProjectConnection = z.infer<typeof workProjectConnectionSchema>;
export type WorkProjectAuditEvent = z.infer<typeof workProjectAuditEventSchema>;
export type WorkspaceWorkItem = z.infer<typeof workspaceWorkItemSchema>;
export type ChangeWorkItemPlanningRequest = z.infer<
  typeof changeWorkItemPlanningRequestSchema
>;
export type WorkItemPlanningEvent = z.infer<typeof workItemPlanningEventSchema>;
export type ChangeWorkAssignmentRequest = z.infer<
  typeof changeWorkAssignmentRequestSchema
>;
export type WorkItemAssignmentEvent = z.infer<
  typeof workItemAssignmentEventSchema
>;
export type CreateWorkRecurrenceRequest = z.infer<
  typeof createWorkRecurrenceRequestSchema
>;
export type UpdateWorkRecurrenceRequest = z.infer<
  typeof updateWorkRecurrenceRequestSchema
>;
export type WorkRecurrenceDefinition = z.infer<
  typeof workRecurrenceDefinitionSchema
>;
export type WorkRecurrenceOccurrence = z.infer<
  typeof workRecurrenceOccurrenceSchema
>;
export type WorkRecurrenceAuditEvent = z.infer<
  typeof workRecurrenceAuditEventSchema
>;
export type WorkRecurrenceJobV1 = z.infer<typeof workRecurrenceJobV1Schema>;
export type LocalRecoveryDrill = z.infer<typeof localRecoveryDrillSchema>;
export type LocalRecoveryStatus = z.infer<typeof localRecoveryStatusSchema>;
export type LocalBackupEvidence = z.infer<typeof localBackupEvidenceSchema>;
export type LocalReleaseRehearsal = z.infer<typeof localReleaseRehearsalSchema>;
export type ChangeWorkItemStatusRequest = z.infer<
  typeof changeWorkItemStatusRequestSchema
>;
export type WorkItemStatusEvent = z.infer<typeof workItemStatusEventSchema>;
export type CreateWorkItemCommentRequest = z.infer<
  typeof createWorkItemCommentRequestSchema
>;
export type WorkItemComment = z.infer<typeof workItemCommentSchema>;
export type CreateWorkItemRelationRequest = z.infer<
  typeof createWorkItemRelationRequestSchema
>;
export type WorkItemRelation = z.infer<typeof workItemRelationSchema>;
export type CreateWorkItemAttachmentRequest = z.infer<
  typeof createWorkItemAttachmentRequestSchema
>;
export type WorkItemAttachment = z.infer<typeof workItemAttachmentSchema>;
export type WorkItemAcceptance = z.infer<typeof workItemAcceptanceSchema>;
export type WorkItemAcceptanceRevision = z.infer<
  typeof workItemAcceptanceRevisionSchema
>;
export type WorkItemVerification = z.infer<typeof workItemVerificationSchema>;
export type KnowledgeItem = z.infer<typeof knowledgeItemSchema>;
export type SavedViewDefinition = z.infer<typeof savedViewDefinitionSchema>;
export type SavedView = z.infer<typeof savedViewSchema>;
export type SavedViewAuditEvent = z.infer<typeof savedViewAuditEventSchema>;
export type CreateKnowledgeProjectLinkRequest = z.infer<
  typeof createKnowledgeProjectLinkRequestSchema
>;
export type KnowledgeProjectLink = z.infer<typeof knowledgeProjectLinkSchema>;
export type KnowledgeProjectConnection = z.infer<
  typeof knowledgeProjectConnectionSchema
>;
export type KnowledgeProjectAuditEvent = z.infer<
  typeof knowledgeProjectAuditEventSchema
>;
export type WorkspaceKnowledgeItem = z.infer<
  typeof workspaceKnowledgeItemSchema
>;
export type ReviseKnowledgeItemRequest = z.infer<
  typeof reviseKnowledgeItemRequestSchema
>;
export type KnowledgeItemRevision = z.infer<typeof knowledgeItemRevisionSchema>;
export type ProjectDecision = z.infer<typeof projectDecisionSchema>;
export type WorkspaceDecision = z.infer<typeof workspaceDecisionSchema>;
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
export type AutomationEvidenceCheck = z.infer<
  typeof automationEvidenceCheckSchema
>;
export type AutomationExportPage = z.infer<typeof automationExportPageSchema>;
export type AutomationJobV1 = z.infer<typeof automationJobV1Schema>;
export type MorningDigestItem = z.infer<typeof morningDigestItemSchema>;
export type MorningDigestResponse = z.infer<typeof morningDigestResponseSchema>;
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
export type LocalIntegration = z.infer<typeof localIntegrationSchema>;
export type LocalConnectorFeedItem = z.infer<
  typeof localConnectorFeedItemSchema
>;
export type LocalConnectorToken = z.infer<typeof localConnectorTokenSchema>;
export type CreateLocalIntegrationRequest = z.infer<
  typeof createLocalIntegrationRequestSchema
>;
export type SetLocalIntegrationEnabledRequest = z.infer<
  typeof setLocalIntegrationEnabledRequestSchema
>;
export type SetLocalIntegrationFreshnessRequest = z.infer<
  typeof setLocalIntegrationFreshnessRequestSchema
>;
export type RunLocalIntegrationSampleRequest = z.infer<
  typeof runLocalIntegrationSampleRequestSchema
>;
export type SyntheticEventImportJobV1 = z.infer<
  typeof syntheticEventImportJobV1Schema
>;
export type SyntheticEventImportRecord = z.infer<
  typeof syntheticEventImportSchema
>;
export type SyntheticFlowReplay = z.infer<typeof syntheticFlowReplaySchema>;
export type SyntheticFlowReplayStage = z.infer<
  typeof syntheticFlowReplayStageSchema
>;
export type SourceEnvelopeRecord = z.infer<typeof sourceEnvelopeSchema>;
export type NormalizedSyntheticEvent = z.infer<typeof normalizedEventSchema>;
export type SyntheticMetricSample = z.infer<typeof syntheticMetricSampleSchema>;
export type SyntheticAlert = z.infer<typeof syntheticAlertSchema>;
export type AttentionItem = z.infer<typeof attentionItemSchema>;
export type LocalAttentionSettings = z.infer<
  typeof localAttentionSettingsSchema
>;
export type UpdateLocalAttentionSettingsRequest = z.infer<
  typeof updateLocalAttentionSettingsRequestSchema
>;
export type LocalAttentionSignal = z.infer<typeof localAttentionSignalSchema>;
export type LocalAttentionAuditEvent = z.infer<
  typeof localAttentionAuditEventSchema
>;
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
export type LocalAgentCallbackRequest = z.infer<
  typeof localAgentCallbackRequestSchema
>;
export type LocalAgentCallbackEvent = z.infer<
  typeof localAgentCallbackEventSchema
>;
export type CreateOvernightQueueEntryRequest = z.infer<
  typeof createOvernightQueueEntryRequestSchema
>;
export type OvernightQueueEntry = z.infer<typeof overnightQueueEntrySchema>;
export type OvernightQueueJobV1 = z.infer<typeof overnightQueueJobV1Schema>;
export type OvernightReadiness = z.infer<typeof overnightReadinessSchema>;
export type OvernightQueueAuditEvent = z.infer<
  typeof overnightQueueAuditEventSchema
>;
export type CreateLocalMcpSessionRequest = z.infer<
  typeof createLocalMcpSessionRequestSchema
>;
export type LocalMcpSession = z.infer<typeof localMcpSessionSchema>;
export type CreatedLocalMcpSession = z.infer<
  typeof createdLocalMcpSessionSchema
>;
export type LocalMcpReadRequest = z.infer<typeof localMcpReadRequestSchema>;
export type LocalMcpReadResponse = z.infer<typeof localMcpReadResponseSchema>;
export type LocalMcpAuditEvent = z.infer<typeof localMcpAuditEventSchema>;
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
