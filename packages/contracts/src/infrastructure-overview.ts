import { z } from "zod";

export const infrastructureOverviewQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(12),
  cursor: z.uuid().optional(),
  projectId: z.uuid().optional(),
  q: z.string().trim().max(160).default(""),
});
export const infrastructureSourceSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: z.string(),
  enabled: z.boolean(),
  observedAt: z.iso.datetime({ offset: true }).nullable(),
  freshnessWindowMinutes: z.number().int().positive(),
  error: z.string().nullable(),
});
export const infrastructureResourceSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: z.string(),
  parentResourceId: z.uuid().nullable(),
  childCount: z.number().int().nonnegative().optional(),
  projects: z.array(z.object({ id: z.uuid(), name: z.string() })),
  sources: z.array(infrastructureSourceSchema),
  telemetry: z.enum([
    "reporting",
    "stale",
    "unknown",
    "disabled",
    "future",
    "error",
  ]),
  health: z.literal("unknown"),
  metrics: z.array(
    z.object({
      name: z.string(),
      unit: z.string(),
      value: z.number(),
      sampledAt: z.iso.datetime({ offset: true }),
      evidenceHref: z.string().startsWith("/api/v1/source-envelopes/"),
    }),
  ),
});
export const infrastructureOverviewSchema = z.object({
  readAt: z.iso.datetime({ offset: true }),
  total: z.number().int().nonnegative(),
  items: z.array(infrastructureResourceSchema),
  nextCursor: z.uuid().nullable(),
  edges: z.array(
    z.object({
      id: z.string(),
      from: z.uuid(),
      to: z.uuid(),
      type: z.enum(["contains", "depends_on"]),
    }),
  ),
  events: z.array(
    z.object({
      id: z.uuid(),
      resourceId: z.uuid().nullable(),
      summary: z.string(),
      occurredAt: z.iso.datetime({ offset: true }),
      sourceLabel: z.string(),
      evidenceHref: z.string().startsWith("/api/v1/source-envelopes/"),
    }),
  ),
});
export type InfrastructureOverviewQuery = z.infer<
  typeof infrastructureOverviewQuerySchema
>;
export type InfrastructureSource = z.infer<typeof infrastructureSourceSchema>;
export type InfrastructureResource = z.infer<
  typeof infrastructureResourceSchema
>;
export type InfrastructureOverview = z.infer<
  typeof infrastructureOverviewSchema
>;
