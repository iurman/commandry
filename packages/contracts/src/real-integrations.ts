import { z } from "zod";

export const realIntegrationKindSchema = z.enum([
  "github-repository",
  "linux-host",
]);
export const createRealIntegrationRequestSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(160),
    kind: realIntegrationKindSchema,
    projectId: z.uuid(),
    resourceId: z.uuid(),
    identifier: z.string().trim().min(1).max(200),
    freshnessWindowMinutes: z.number().int().min(1).max(10080).default(15),
  })
  .superRefine((input, context) => {
    const valid =
      input.kind === "github-repository"
        ? /^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}\/[a-zA-Z0-9_.-]{1,100}$/.test(
            input.identifier,
          )
        : /^[a-zA-Z0-9][a-zA-Z0-9.-]{0,252}$/.test(input.identifier);
    if (!valid)
      context.addIssue({
        code: "custom",
        path: ["identifier"],
        message: "Use owner/repository or an exact hostname",
      });
  });
export const realIntegrationSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: realIntegrationKindSchema,
  projectId: z.uuid(),
  resourceId: z.uuid(),
  identifier: z.string(),
  enabled: z.boolean(),
  isSynthetic: z.literal(false),
  receiverConfigured: z.boolean(),
  freshnessWindowMinutes: z.number().int(),
  freshnessState: z.enum(["unknown", "fresh", "stale", "future"]),
  lastAttemptAt: z.iso.datetime({ offset: true }).nullable(),
  lastSuccessAt: z.iso.datetime({ offset: true }).nullable(),
  lastObservedAt: z.iso.datetime({ offset: true }).nullable(),
  lastError: z.string().nullable(),
  nextAttemptAt: z.iso.datetime({ offset: true }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});
export const realIntegrationPageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.uuid().optional(),
});
export const listRealIntegrationsResponseSchema = z.object({
  items: z.array(realIntegrationSchema),
  nextCursor: z.uuid().nullable(),
});
export const linuxHostSampleSchema = z
  .strictObject({
    hostname: z.string().min(1).max(253),
    sampleId: z.uuid(),
    observedAt: z.iso.datetime({ offset: true }),
    memory: z.strictObject({
      totalBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      availableBytes: z
        .number()
        .int()
        .nonnegative()
        .max(Number.MAX_SAFE_INTEGER),
    }),
    disk: z.strictObject({
      totalBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      availableBytes: z
        .number()
        .int()
        .nonnegative()
        .max(Number.MAX_SAFE_INTEGER),
    }),
    uptimeSeconds: z.number().int().nonnegative().max(2147483647),
    load1Milli: z.number().int().nonnegative().max(2147483647),
  })
  .superRefine((sample, context) => {
    if (
      sample.memory.availableBytes > sample.memory.totalBytes ||
      sample.disk.availableBytes > sample.disk.totalBytes
    )
      context.addIssue({
        code: "custom",
        message: "Available capacity exceeds total capacity",
      });
  });
export const realSourceEnvelopeSchema = z.object({
  id: z.uuid(),
  integrationInstanceId: z.uuid(),
  sourceKind: realIntegrationKindSchema,
  sourceLabel: z.string(),
  sourceSchemaVersion: z.enum(["github-events/v1", "linux-host/v1"]),
  sourceEventId: z.string(),
  rawPayload: z.unknown(),
  occurredAt: z.iso.datetime({ offset: true }),
  receivedAt: z.iso.datetime({ offset: true }),
  isSynthetic: z.literal(false),
});
export const realObservationSchema = z.object({
  id: z.uuid(),
  type: z.string(),
  summary: z.string(),
  projectId: z.uuid(),
  resourceId: z.uuid(),
  occurredAt: z.iso.datetime({ offset: true }),
  sourceLabel: z.string(),
  isSynthetic: z.literal(false),
  evidenceHref: z.string().startsWith("/api/v1/source-envelopes/"),
  metrics: z.array(
    z.object({ name: z.string(), unit: z.string(), value: z.number().int() }),
  ),
});
export const listRealObservationsResponseSchema = z.object({
  items: z.array(realObservationSchema),
  nextCursor: z.uuid().nullable(),
});
export const realReceiverTokenSchema = z.object({
  token: z.string().min(32),
  notice: z.literal("Host receiver token; shown once"),
});
export const setRealIntegrationEnabledRequestSchema = z.strictObject({
  enabled: z.boolean(),
});
export type CreateRealIntegrationRequest = z.infer<
  typeof createRealIntegrationRequestSchema
>;
export type RealIntegration = z.infer<typeof realIntegrationSchema>;
export type LinuxHostSample = z.infer<typeof linuxHostSampleSchema>;
