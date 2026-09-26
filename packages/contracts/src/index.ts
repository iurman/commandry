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

export const resourceSummarySchema = z.object({
  id: z.uuid(),
  kind: z.string().min(1),
  name: z.string().min(1),
  subtype: z.string().nullable(),
  state: z.string().nullable(),
  externalUrl: z.url().nullable(),
  lastObservedAt: z.iso.datetime({ offset: true }).nullable(),
});

export const listResourcesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.uuid().optional(),
});

export const listResourcesResponseSchema = z.object({
  items: z.array(resourceSummarySchema),
  nextCursor: z.string().nullable(),
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
export type SyntheticJobV1 = z.infer<typeof syntheticJobV1Schema>;
export type SyntheticRunResponse = z.infer<typeof syntheticRunSchema>;
