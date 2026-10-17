import { z } from "zod";
import { observatorySceneQuerySchema } from "./observatory-queries";
import { observatoryRepositoryEvidenceSchema } from "./observatory-repository";

const identity = z.uuid().toLowerCase();
const timestamp = z.iso.datetime({ offset: true });
const text = (maximum: number) => z.string().min(1).max(maximum);
const identifier = text(200).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/);
const status = z.enum([
  "up",
  "down",
  "degraded",
  "unknown",
  "pending",
  "paused",
  "unreachable",
]);
export const observatoryOperationalFacetSchema = z.enum([
  "availability",
  "pull_requests",
  "security",
]);
export const observatoryOperationalEvidenceQuerySchema =
  observatorySceneQuerySchema
    .extend({
      resourceId: identity,
      facet: observatoryOperationalFacetSchema,
      includePullRequestChecks: z.boolean().optional(),
    })
    .refine(
      (query) =>
        query.includePullRequestChecks !== true ||
        query.facet === "pull_requests",
      {
        path: ["includePullRequestChecks"],
        message: "Pull request checks require the pull_requests facet",
      },
    );
const errorCode = z.enum([
  "OPERATIONAL_INVALID_CLAIM",
  "OPERATIONAL_INVALID_OBSERVATION",
  "OPERATIONAL_INVALID_RESPONSE",
  "OPERATIONAL_CONFIGURATION_INVALID",
  "OPERATIONAL_UNSUPPORTED_SOURCE",
  "OPERATIONAL_UNAUTHORIZED",
  "OPERATIONAL_NOT_FOUND",
  "OPERATIONAL_RATE_LIMITED",
  "OPERATIONAL_TIMEOUT",
  "OPERATIONAL_RESPONSE_TOO_LARGE",
  "OPERATIONAL_UNAVAILABLE",
]);
const sourceFields = {
  projectId: identity,
  resourceId: identity,
  version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  environment: text(100).nullable(),
  enabled: z.boolean(),
  lastAttemptAt: timestamp.nullable(),
  lastSuccessAt: timestamp.nullable(),
  lastError: errorCode.nullable(),
  observedAt: timestamp.nullable(),
};
/** Transaction adapter input only. `details` is validated before facet projection. */
export const observatoryOperationalSourceRecordSchema = z.strictObject({
  ...sourceFields,
  id: identity,
  kind: z.enum(["infraagent-monitor", "github-repository", "http-readiness"]),
  freshnessSeconds: z.number().int().min(30).max(86400),
  details: z
    .unknown()
    .refine((value) => value !== undefined, "Missing details field"),
});
export const observatoryAvailabilityEvidenceSchema = z
  .strictObject({
    monitorId: identifier,
    monitorStatus: status,
    enabled: z.boolean(),
    sourceState: z.enum(["available", "stale", "unknown", "disabled"]),
    reason: z.enum([
      "observed",
      "stale",
      "disabled",
      "paused",
      "pending",
      "unknown",
      "future",
      "no_observation",
    ]),
    lastCheckedAt: timestamp.nullable(),
    latestCheck: z
      .strictObject({
        checkedAt: timestamp,
        status,
        responseTimeMs: z.number().finite().nonnegative().nullable(),
        statusCode: z.number().int().min(100).max(599).nullable(),
      })
      .nullable(),
    openIncident: z
      .strictObject({
        id: identifier,
        startedAt: timestamp,
        acknowledgedAt: timestamp.nullable(),
      })
      .nullable(),
    recentChecksLimit: z.literal(25),
    historyComplete: z.literal(false),
  })
  .superRefine((value, context) => {
    const sameCheck =
      value.lastCheckedAt === null
        ? value.latestCheck === null
        : value.latestCheck !== null &&
          Date.parse(value.lastCheckedAt) ===
            Date.parse(value.latestCheck.checkedAt);
    const observed = ["available", "stale"].includes(value.sourceState);
    if (
      !sameCheck ||
      (observed &&
        (!value.enabled ||
          !value.latestCheck ||
          !["up", "down", "degraded"].includes(value.latestCheck.status) ||
          value.monitorStatus !== value.latestCheck.status ||
          value.reason !==
            (value.sourceState === "stale" ? "stale" : "observed"))) ||
      (value.sourceState === "disabled" &&
        !["disabled", "paused"].includes(value.reason)) ||
      (value.sourceState === "unknown" &&
        !["pending", "unknown", "future", "no_observation"].includes(
          value.reason,
        )) ||
      (!value.enabled && value.sourceState !== "disabled")
    )
      context.addIssue({
        code: "custom",
        message:
          "Availability evidence must retain its actual check and source state",
      });
  });
const emptyComponent = (readAt: string) => ({
  state: "available" as const,
  readAt,
  complete: true,
  items: [],
  errorCode: null,
  retrySeconds: null,
});
export const observatoryPullRequestEvidenceSchema = z
  .strictObject({
    repository: observatoryRepositoryEvidenceSchema.shape.repository,
    readAt: observatoryRepositoryEvidenceSchema.shape.readAt,
    pullRequests: observatoryRepositoryEvidenceSchema.shape.pullRequests,
  })
  .refine(
    (value) =>
      observatoryRepositoryEvidenceSchema.safeParse({
        schemaVersion: 1,
        ...value,
        security: {
          codeScanning: {
            analyses: emptyComponent(value.readAt),
            alerts: emptyComponent(value.readAt),
            currentHeadCoverage: "unknown",
          },
          dependabot: emptyComponent(value.readAt),
          secretScanning: emptyComponent(value.readAt),
        },
      }).success,
    "Invalid repository pull request identity or completeness",
  );
export const observatorySecurityEvidenceSchema = z
  .strictObject({
    repository: observatoryRepositoryEvidenceSchema.shape.repository,
    readAt: observatoryRepositoryEvidenceSchema.shape.readAt,
    security: observatoryRepositoryEvidenceSchema.shape.security,
  })
  .refine(
    (value) =>
      observatoryRepositoryEvidenceSchema.safeParse({
        schemaVersion: 1,
        ...value,
        pullRequests: emptyComponent(value.readAt),
      }).success,
    "Invalid repository security identity or completeness",
  );
export const observatoryOperationalRepositoryDetailsSchema = z
  .strictObject({
    sourceState: z.enum(["available", "unknown"]),
    reason: z.enum(["observed", "no_observation"]),
    repository: observatoryRepositoryEvidenceSchema,
  })
  .refine(
    (value) =>
      value.reason ===
      (value.sourceState === "available" ? "observed" : "no_observation"),
    "Repository source state mismatch",
  );

const itemFields = {
  ...sourceFields,
  sourceId: identity,
  freshness: z.enum(["fresh", "stale", "future", "unknown"]),
};
const envelope = {
  schemaVersion: z.literal(1),
  scopeDigest: text(500),
  projectionRevision: text(500),
  completeness: z.literal("complete"),
  resourceId: identity,
  access: z.enum(["available", "unavailable", "disabled", "unsupported"]),
};
export const observatoryOperationalEvidenceResultSchema = z
  .discriminatedUnion("facet", [
    z.strictObject({
      ...envelope,
      facet: z.literal("availability"),
      items: z.array(
        z.strictObject({
          ...itemFields,
          kind: z.enum(["infraagent-monitor", "http-readiness"]),
          payload: observatoryAvailabilityEvidenceSchema.nullable(),
        }),
      ),
    }),
    z.strictObject({
      ...envelope,
      facet: z.literal("pull_requests"),
      items: z.array(
        z.strictObject({
          ...itemFields,
          kind: z.literal("github-repository"),
          payload: observatoryPullRequestEvidenceSchema.nullable(),
        }),
      ),
    }),
    z.strictObject({
      ...envelope,
      facet: z.literal("security"),
      items: z.array(
        z.strictObject({
          ...itemFields,
          kind: z.literal("github-repository"),
          payload: observatorySecurityEvidenceSchema.nullable(),
        }),
      ),
    }),
  ])
  .superRefine((value, context) => {
    const current = value.items.filter((item) => item.enabled);
    if (
      new Set(value.items.map((item) => item.sourceId)).size !==
        value.items.length ||
      value.items.some(
        (item) =>
          item.resourceId !== value.resourceId ||
          (item.observedAt === null) !== (item.freshness === "unknown"),
      ) ||
      (value.access === "unsupported" && value.items.length !== 0) ||
      (value.access === "disabled" &&
        (!value.items.length || current.length !== 0)) ||
      (value.access === "available" &&
        (!current.length ||
          current.some(
            (item) => item.payload === null || item.lastError !== null,
          )))
    )
      context.addIssue({
        code: "custom",
        message: "Operational evidence subject, access or observation mismatch",
      });
  });

export type ObservatoryOperationalEvidenceQuery = z.infer<
  typeof observatoryOperationalEvidenceQuerySchema
>;
export type ObservatoryOperationalEvidenceResult = z.infer<
  typeof observatoryOperationalEvidenceResultSchema
>;
export type ObservatoryOperationalSourceRecord = z.infer<
  typeof observatoryOperationalSourceRecordSchema
>;
export type ObservatoryAvailabilityEvidenceDto = z.infer<
  typeof observatoryAvailabilityEvidenceSchema
>;
export type ObservatoryPullRequestEvidenceDto = z.infer<
  typeof observatoryPullRequestEvidenceSchema
>;
export type ObservatorySecurityEvidenceDto = z.infer<
  typeof observatorySecurityEvidenceSchema
>;
