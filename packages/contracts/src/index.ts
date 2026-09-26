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

export const listWorkItemsResponseSchema = z.object({
  items: z.array(workItemSchema),
  nextCursor: z.uuid().nullable(),
});

export const listKnowledgeItemsResponseSchema = z.object({
  items: z.array(knowledgeItemSchema),
  nextCursor: z.uuid().nullable(),
});

export const searchQuerySchema = listResourcesQuerySchema.extend({
  q: z.string().trim().min(1).max(200),
  projectId: z.uuid().optional(),
});

export const searchResultSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["capture", "task", "note", "project", "resource"]),
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
export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;
export type CreateResourceRequest = z.infer<typeof createResourceRequestSchema>;
export type CreateProjectResourceLinkRequest = z.infer<
  typeof createProjectResourceLinkRequestSchema
>;
export type CreateCaptureRequest = z.infer<typeof createCaptureRequestSchema>;
export type Capture = z.infer<typeof captureSchema>;
export type FileCaptureRequest = z.infer<typeof fileCaptureRequestSchema>;
export type WorkItem = z.infer<typeof workItemSchema>;
export type KnowledgeItem = z.infer<typeof knowledgeItemSchema>;
export type FileCaptureResponse = z.infer<typeof fileCaptureResponseSchema>;
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
export type SyntheticJobV1 = z.infer<typeof syntheticJobV1Schema>;
export type SyntheticRunResponse = z.infer<typeof syntheticRunSchema>;
