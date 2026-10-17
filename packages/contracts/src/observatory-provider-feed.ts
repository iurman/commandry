import { z } from "zod";
import { observatorySceneQuerySchema } from "./observatory-queries";
const identity = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
const at = z.iso.datetime({ offset: true });
const text = (maximum: number) => z.string().min(1).max(maximum);
export const observatoryPublicProviderNoticeSchema = z
  .strictObject({
    id: identity,
    kind: z.enum(["incident", "maintenance"]),
    title: text(2000),
    status: text(80),
    severity: text(80),
    componentIds: z.array(identity),
    createdAt: at,
    updatedAt: at,
    resolvedAt: at.nullable(),
    scheduledFor: at.nullable(),
    scheduledUntil: at.nullable(),
    evidenceHref: z.url(),
    updates: z.array(
      z.strictObject({
        id: identity,
        status: text(80),
        body: text(65536),
        occurredAt: at,
      }),
    ),
  })
  .superRefine((value, context) => {
    if (
      value.evidenceHref !==
        `https://www.cloudflarestatus.com/incidents/${value.id}` ||
      new Set(value.componentIds).size !== value.componentIds.length ||
      new Set(value.updates.map((update) => update.id)).size !==
        value.updates.length
    )
      context.addIssue({
        code: "custom",
        message: "Provider notice identity or evidence mismatch",
      });
  });
export const observatoryPublicProviderSnapshotSchema = z
  .strictObject({
    provider: z.literal("cloudflare"),
    endpoint: z.literal("https://www.cloudflarestatus.com/api/v2/summary.json"),
    readAt: at,
    reportedAt: at,
    complete: z.literal(true),
    components: z.array(
      z.strictObject({
        id: identity,
        name: text(2000),
        status: text(80),
        groupId: identity.nullable(),
      }),
    ),
    notices: z.array(observatoryPublicProviderNoticeSchema),
  })
  .superRefine((value, context) => {
    if (
      new Set(value.components.map((item) => item.id)).size !==
        value.components.length ||
      new Set(value.notices.map((item) => item.id)).size !==
        value.notices.length
    )
      context.addIssue({
        code: "custom",
        message: "Duplicate provider identity",
      });
  });
export const observatoryProviderFeedCursorSchema = z.strictObject({
  afterId: identity,
  revision: z.number().int().nonnegative(),
  scopeDigest: text(500),
});
export const observatoryProviderFeedQuerySchema =
  observatorySceneQuerySchema.extend({
    limit: z.number().int().min(1).max(100).default(50),
    cursor: observatoryProviderFeedCursorSchema.nullable().default(null),
  });
export const observatoryProviderFeedRecordsSchema = z
  .strictObject({
    state: z.enum(["unknown", "disabled", "unavailable", "stale", "current"]),
    lastSuccessAt: at.nullable(),
    lastAttemptAt: at.nullable(),
    lastError: z
      .string()
      .regex(/^[A-Z_]{1,100}$/)
      .nullable(),
    revision: z.number().int().nonnegative(),
    snapshot: observatoryPublicProviderSnapshotSchema.nullable(),
    notices: z.array(
      z.strictObject({
        providerId: z.literal("cloudflare"),
        id: identity,
        record: observatoryPublicProviderNoticeSchema,
        sourceUpdatedAt: at,
        active: z.boolean(),
        reconciledAt: at.nullable(),
        lastSeenAt: at,
      }),
    ),
    nextCursor: identity.nullable(),
  })
  .superRefine((value, context) => {
    if (
      new Set(value.notices.map((item) => item.id)).size !==
        value.notices.length ||
      value.notices.some(
        (item) =>
          item.id !== item.record.id ||
          Date.parse(item.sourceUpdatedAt) !==
            Date.parse(item.record.updatedAt),
      ) ||
      (value.nextCursor !== null &&
        value.nextCursor !== value.notices.at(-1)?.id)
    )
      context.addIssue({
        code: "custom",
        message: "Incomplete provider page or mismatched source evidence",
      });
  });
export const observatoryProviderFeedResultSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    scopeDigest: text(500),
    projectionRevision: text(500),
    population: z.literal("recorded_provider_notices"),
    feed: z
      .strictObject(observatoryProviderFeedRecordsSchema.shape)
      .omit({ notices: true, nextCursor: true }),
    items: observatoryProviderFeedRecordsSchema.shape.notices,
    nextCursor: observatoryProviderFeedCursorSchema.nullable(),
  })
  .superRefine((value, context) => {
    if (
      !observatoryProviderFeedRecordsSchema.safeParse({
        ...value.feed,
        notices: value.items,
        nextCursor: value.nextCursor?.afterId ?? null,
      }).success ||
      (value.nextCursor !== null &&
        (value.nextCursor.revision !== value.feed.revision ||
          value.nextCursor.scopeDigest !== value.scopeDigest))
    )
      context.addIssue({
        code: "custom",
        message: "Provider continuation or evidence mismatch",
      });
  });
export type ObservatoryProviderFeedQuery = z.infer<
  typeof observatoryProviderFeedQuerySchema
>;
export type ObservatoryProviderFeedResult = z.infer<
  typeof observatoryProviderFeedResultSchema
>;
