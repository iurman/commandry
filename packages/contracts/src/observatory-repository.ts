import { z } from "zod";

const timestamp = z.iso.datetime({ offset: true });
const text = z.string().min(1).max(1000);
const number = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const owner = z
  .string()
  .regex(/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/)
  .refine((value) => !value.includes("--"));
const name = z
  .string()
  .regex(/^[a-zA-Z0-9_.-]{1,100}$/)
  .refine((value) => value !== "." && value !== "..");
const officialLink = z.url().refine((value) => {
  const url = new URL(value);
  return (
    url.origin === "https://github.com" &&
    !url.username &&
    !url.password &&
    !url.hash
  );
});

export const observatoryRepositorySourceStateSchema = z.enum([
  "available",
  "inaccessible",
  "unavailable",
  "disabled_or_not_found",
  "unsupported",
]);
const failureCode = z.enum([
  "OPERATIONAL_INVALID_RESPONSE",
  "OPERATIONAL_UNSUPPORTED_SOURCE",
  "OPERATIONAL_UNAUTHORIZED",
  "OPERATIONAL_NOT_FOUND",
  "OPERATIONAL_RATE_LIMITED",
  "OPERATIONAL_TIMEOUT",
  "OPERATIONAL_RESPONSE_TOO_LARGE",
  "OPERATIONAL_UNAVAILABLE",
]);
export const observatoryRepositoryPullRequestSchema = z.strictObject({
  id: number,
  number,
  title: z.string().max(10000),
  draft: z.boolean(),
  updatedAt: timestamp,
  baseRef: text,
  headRef: text,
  author: z.string().min(1).max(100).nullable(),
  url: officialLink,
});
const tool = z.strictObject({
  name: text,
  version: text.nullable(),
  guid: text.nullable(),
});
export const observatoryRepositoryAnalysisSchema = z.strictObject({
  id: number,
  ref: text,
  commitSha: z.string().regex(/^[a-f0-9]{40,64}$/i),
  tool,
  createdAt: timestamp,
  freshness: z.enum(["fresh", "stale", "future"]),
  outcome: z.enum(["completed", "error", "unknown"]),
  hasWarnings: z.boolean(),
  resultsCount: z.number().int().nonnegative().nullable(),
  url: officialLink,
});
export const observatoryRepositoryAlertSchema = z.strictObject({
  number,
  category: z.enum(["code", "dependency", "secret"]),
  severity: z.enum([
    "critical",
    "high",
    "medium",
    "low",
    "warning",
    "note",
    "error",
    "unknown",
  ]),
  tool: text.nullable(),
  rule: text.nullable(),
  state: z.literal("open"),
  createdAt: timestamp,
  updatedAt: timestamp.nullable(),
  ref: text.nullable(),
  url: officialLink,
});

function component<T extends z.ZodType>(item: T) {
  return z
    .strictObject({
      state: observatoryRepositorySourceStateSchema,
      readAt: timestamp,
      complete: z.boolean(),
      items: z.array(item),
      errorCode: failureCode.nullable(),
      retrySeconds: z.number().int().min(30).max(86400).nullable(),
    })
    .superRefine((value, context) => {
      const available = value.state === "available";
      if (
        value.complete !== available ||
        (available
          ? value.errorCode !== null || value.retrySeconds !== null
          : value.errorCode === null ||
            value.retrySeconds === null ||
            value.items.length !== 0) ||
        (value.state === "inaccessible" &&
          value.errorCode !== "OPERATIONAL_UNAUTHORIZED") ||
        (value.state === "disabled_or_not_found" &&
          value.errorCode !== "OPERATIONAL_NOT_FOUND") ||
        (value.state === "unsupported" &&
          value.errorCode !== "OPERATIONAL_UNSUPPORTED_SOURCE") ||
        (value.state === "unavailable" &&
          [
            "OPERATIONAL_UNAUTHORIZED",
            "OPERATIONAL_NOT_FOUND",
            "OPERATIONAL_UNSUPPORTED_SOURCE",
          ].includes(value.errorCode ?? ""))
      )
        context.addIssue({
          code: "custom",
          message:
            "Source state must disclose complete success or safe failure",
        });
    });
}
const pulls = component(observatoryRepositoryPullRequestSchema);
const analyses = component(observatoryRepositoryAnalysisSchema);
const alerts = component(observatoryRepositoryAlertSchema);

/** Derived public evidence only. Original HTTP payloads belong in private storage. */
export const observatoryRepositoryEvidenceSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    repository: z.strictObject({ owner, name, url: officialLink }),
    readAt: timestamp,
    pullRequests: pulls,
    security: z.strictObject({
      codeScanning: z.strictObject({
        analyses,
        alerts,
        currentHeadCoverage: z.literal("unknown"),
      }),
      dependabot: alerts,
      secretScanning: alerts,
    }),
  })
  .superRefine((value, context) => {
    const root = `https://github.com/${value.repository.owner}/${value.repository.name}`;
    const valid =
      value.repository.url === root &&
      value.pullRequests.items.every(
        (item) => item.url === `${root}/pull/${item.number}`,
      ) &&
      value.security.codeScanning.analyses.items.every(
        (item) =>
          item.url ===
          `${root}/security/code-scanning?query=${encodeURIComponent(`ref:${item.ref}`)}`,
      ) &&
      [
        [value.security.codeScanning.alerts, "code", "code-scanning"],
        [value.security.dependabot, "dependency", "dependabot"],
        [value.security.secretScanning, "secret", "secret-scanning"],
      ].every(([source, category, path]) =>
        typeof source === "object" && source !== null
          ? source.items.every(
              (item) =>
                item.category === category &&
                item.url === `${root}/security/${path}/${item.number}`,
            )
          : false,
      );
    const components = [
      value.pullRequests,
      value.security.codeScanning.analyses,
      value.security.codeScanning.alerts,
      value.security.dependabot,
      value.security.secretScanning,
    ];
    if (
      !valid ||
      components.some(
        (source) => Date.parse(source.readAt) > Date.parse(value.readAt),
      ) ||
      new Set(value.pullRequests.items.map((item) => item.id)).size !==
        value.pullRequests.items.length ||
      new Set(value.pullRequests.items.map((item) => item.number)).size !==
        value.pullRequests.items.length ||
      new Set(value.security.codeScanning.analyses.items.map((item) => item.id))
        .size !== value.security.codeScanning.analyses.items.length ||
      [
        value.security.codeScanning.alerts,
        value.security.dependabot,
        value.security.secretScanning,
      ].some(
        (source) =>
          new Set(source.items.map((item) => item.number)).size !==
          source.items.length,
      )
    )
      context.addIssue({
        code: "custom",
        message:
          "Evidence must retain exact repository identity and unique rows",
      });
  });

export type ObservatoryRepositoryEvidenceDto = z.infer<
  typeof observatoryRepositoryEvidenceSchema
>;
export type ObservatoryRepositoryPullRequestDto = z.infer<
  typeof observatoryRepositoryPullRequestSchema
>;
export type ObservatoryRepositoryAnalysisDto = z.infer<
  typeof observatoryRepositoryAnalysisSchema
>;
export type ObservatoryRepositoryAlertDto = z.infer<
  typeof observatoryRepositoryAlertSchema
>;
