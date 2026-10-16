import { z } from "zod";
import {
  foundationActorSchema,
  foundationConfigurationSchema,
  foundationEvidenceSchema,
  foundationMemorySchema,
  foundationOperationSchema,
  foundationPageSchema,
} from "./agent-foundation";

const identity = foundationActorSchema.shape.projectId;
const environment = foundationActorSchema.shape.environment;
const datetime = foundationActorSchema.shape.expiresAt;
const name = z.string().trim().min(1).max(100);
const humanIdentity = z
  .string()
  .min(1)
  .max(500)
  .refine((value) => value.trim().length > 0, "Must not be blank");

// Preserve ordering below millisecond precision after comparing UTC instants.
const compareDatetimes = (left: string, right: string): number => {
  const millisecondPrefix = (value: string) =>
    value.replace(
      /\.(\d+)(?=Z|[+-]\d{2}:\d{2}$)/,
      (_, digits: string) => `.${digits.slice(0, 3).padEnd(3, "0")}`,
    );
  const milliseconds =
    Date.parse(millisecondPrefix(left)) - Date.parse(millisecondPrefix(right));
  if (milliseconds !== 0) return milliseconds;
  const remainder = (value: string) =>
    (value.match(/\.(\d+)/)?.[1] ?? "").slice(3);
  const leftRemainder = remainder(left);
  const rightRemainder = remainder(right);
  const length = Math.max(leftRemainder.length, rightRemainder.length);
  const leftPadded = leftRemainder.padEnd(length, "0");
  const rightPadded = rightRemainder.padEnd(length, "0");
  return leftPadded < rightPadded ? -1 : leftPadded > rightPadded ? 1 : 0;
};

export const foundationMachineOperationSchema =
  foundationOperationSchema.extract([
    "foundation.read",
    "work.read",
    "work.propose",
    "evidence.record",
    "memory.propose",
    "memory.revise",
    "configuration.record",
    "evaluation.record",
  ]);
export type FoundationMachineOperation = z.infer<
  typeof foundationMachineOperationSchema
>;

const operations = z
  .array(foundationMachineOperationSchema)
  .min(1)
  .max(foundationMachineOperationSchema.options.length)
  .refine(
    (values) => new Set(values).size === values.length,
    "Duplicate capability",
  );

export const foundationCreateClientSchema = z.strictObject({
  name,
  projectId: identity,
  operations,
  environment,
  ttlSeconds: z.number().int().min(60).max(2592000),
});
export type FoundationCreateClient = z.infer<
  typeof foundationCreateClientSchema
>;

export const foundationClientSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id: identity,
    projectId: identity,
    name,
    operations,
    environment,
    createdAt: datetime,
    expiresAt: datetime,
    revokedAt: datetime.nullable(),
    createdBy: humanIdentity,
  })
  .superRefine((client, context) => {
    if (compareDatetimes(client.expiresAt, client.createdAt) <= 0) {
      context.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "Expiry must be later than creation",
      });
    }
    if (
      client.revokedAt !== null &&
      compareDatetimes(client.revokedAt, client.createdAt) < 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["revokedAt"],
        message: "Revocation must not predate creation",
      });
    }
  });
export type FoundationClient = z.infer<typeof foundationClientSchema>;

export const foundationIssuedClientSchema = z.strictObject({
  client: foundationClientSchema,
  token: z
    .string()
    .length(46)
    .regex(/^af_[A-Za-z0-9_-]{43}$/),
  notice: z.literal(
    "Credential shown once; store it outside Commandry knowledge.",
  ),
});
export type FoundationIssuedClient = z.infer<
  typeof foundationIssuedClientSchema
>;

export const foundationRevokeClientSchema = z.strictObject({
  clientId: identity,
});
export type FoundationRevokeClient = z.infer<
  typeof foundationRevokeClientSchema
>;

export const foundationIdempotencyKeySchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/)
  .refine((value) => !/[^A-Za-z0-9._:-]/.test(value), "Invalid ASCII key");
export type FoundationIdempotencyKey = z.infer<
  typeof foundationIdempotencyKeySchema
>;

export const foundationScopedPageSchema = foundationPageSchema.extend({
  projectId: identity,
});
export type FoundationScopedPage = z.infer<typeof foundationScopedPageSchema>;

// A general request does not manufacture a task execution packet or grant.
export const foundationGeneralContextRequestSchema =
  foundationScopedPageSchema.extend({
    maxCharacters: z.number().int().min(1).max(100000).default(12000),
    taskDirection: z.string().max(32000).default(""),
  });
export type FoundationGeneralContextRequest = z.infer<
  typeof foundationGeneralContextRequestSchema
>;

export const foundationEvidenceSummarySchema = foundationEvidenceSchema;
export const foundationMemorySummarySchema = foundationMemorySchema
  .pick({
    id: true,
    projectId: true,
    knowledgeItemId: true,
    version: true,
    contentDigest: true,
    lifecycle: true,
    verification: true,
    recordedAt: true,
  })
  .extend({ category: foundationMemorySchema.shape.content.shape.category });
export const foundationConfigurationSummarySchema =
  foundationConfigurationSchema.pick({
    id: true,
    projectId: true,
    kind: true,
    contentDigest: true,
    recordedAt: true,
  });

export const foundationReadRecordSchema = z.strictObject({
  projectId: identity,
  id: identity,
});
export type FoundationReadRecord = z.infer<typeof foundationReadRecordSchema>;

export const foundationCreateConfigurationSchema = z.strictObject({
  projectId: identity,
  kind: foundationConfigurationSchema.shape.kind,
  content: foundationConfigurationSchema.shape.content,
  parentIds: foundationConfigurationSchema.shape.parentIds.max(1000),
  sourceCommit: foundationConfigurationSchema.shape.sourceCommit,
});
export type FoundationCreateConfiguration = z.infer<
  typeof foundationCreateConfigurationSchema
>;

export const foundationInstructionApprovalSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id: identity,
    projectId: identity,
    memoryId: identity,
    version: z.number().int().positive(),
    contentDigest: z
      .string()
      .length(64)
      .regex(/^[a-f0-9]{64}$/),
    disclosureProjectId: identity,
    approvedAt: datetime,
    expiresAt: datetime,
    approvedBy: humanIdentity,
    revokedAt: datetime.nullable(),
  })
  .superRefine((approval, context) => {
    if (approval.disclosureProjectId !== approval.projectId) {
      context.addIssue({
        code: "custom",
        path: ["disclosureProjectId"],
        message: "Disclosure must remain in the approved project",
      });
    }
    if (compareDatetimes(approval.expiresAt, approval.approvedAt) <= 0) {
      context.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "Expiry must be later than approval",
      });
    }
    if (
      approval.revokedAt !== null &&
      compareDatetimes(approval.revokedAt, approval.approvedAt) < 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["revokedAt"],
        message: "Revocation must not predate approval",
      });
    }
  });
export type FoundationInstructionApproval = z.infer<
  typeof foundationInstructionApprovalSchema
>;

export const foundationClientListSchema = z.strictObject({
  items: z.array(foundationClientSchema),
  nextCursor: identity.nullable(),
  asOf: datetime,
});
export const foundationFailureSchema = z.strictObject({
  code: z.enum([
    "INVALID_INPUT",
    "INVALID_CREDENTIAL",
    "EXPIRED",
    "REVOKED",
    "FORBIDDEN",
    "NOT_FOUND",
    "VERSION_CONFLICT",
    "IDEMPOTENCY_CONFLICT",
    "INVALID_REFERENCE",
    "APPROVAL_REQUIRED",
    "FOUNDATION_UNAVAILABLE",
  ]),
});
