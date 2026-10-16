import { createHash } from "node:crypto";

export const FOUNDATION_OPERATIONS = Object.freeze([
  "foundation.read",
  "work.read",
  "work.propose",
  "work.proposal.review",
  "evidence.record",
  "memory.propose",
  "memory.revise",
  "memory.import",
  "memory.review",
  "memory.verify",
  "instruction.approve",
  "configuration.record",
  "evaluation.record",
] as const);

export type FoundationOperation = (typeof FOUNDATION_OPERATIONS)[number];
export type FoundationEnvironment = "local" | "test" | "preview" | "production";
export type FoundationErrorCode =
  | "INVALID_CREDENTIAL"
  | "EXPIRED"
  | "REVOKED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VERSION_CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "INVALID_REFERENCE"
  | "APPROVAL_REQUIRED";

export class FoundationError extends Error {
  constructor(
    public readonly code: FoundationErrorCode,
    message: string = code,
  ) {
    super(message);
    this.name = "FoundationError";
  }
}

export type FoundationInstant = string | Date;

export type FoundationGrant = {
  id: string;
  projectId: string;
  operations: readonly FoundationOperation[];
  environment: FoundationEnvironment;
  expiresAt: FoundationInstant;
  revokedAt: FoundationInstant | null;
};

export type FoundationAuthorizationRequest = {
  operation: FoundationOperation;
  projectId: string;
  environment: FoundationEnvironment;
  now: Date;
};

export type FoundationOperationPolicy = {
  readonly scope: "project";
  readonly risk: "read_only" | "reversible" | "sensitive";
  readonly requiredCapability: FoundationOperation;
  readonly approval: "automatic_with_grant" | "owner_only";
  readonly auditEvent: FoundationOperation;
  readonly concurrency:
    "read_snapshot" | "expected_version" | "immutable_create";
  readonly idempotency: "principal_operation_key";
};

function operationPolicy<Operation extends FoundationOperation>(
  operation: Operation,
  risk: FoundationOperationPolicy["risk"],
  approval: FoundationOperationPolicy["approval"],
  concurrency: FoundationOperationPolicy["concurrency"],
) {
  return Object.freeze({
    scope: "project" as const,
    risk,
    requiredCapability: operation,
    approval,
    auditEvent: operation,
    concurrency,
    idempotency: "principal_operation_key" as const,
  });
}

export const FOUNDATION_OPERATION_POLICIES = Object.freeze({
  "foundation.read": operationPolicy(
    "foundation.read",
    "read_only",
    "automatic_with_grant",
    "read_snapshot",
  ),
  "work.read": operationPolicy(
    "work.read",
    "read_only",
    "automatic_with_grant",
    "read_snapshot",
  ),
  // Task-only pending submission. No task creation, filing or execution grant.
  "work.propose": operationPolicy(
    "work.propose",
    "reversible",
    "automatic_with_grant",
    "immutable_create",
  ),
  // Owner review binds an exact version; this declaration does not execute it.
  "work.proposal.review": operationPolicy(
    "work.proposal.review",
    "sensitive",
    "owner_only",
    "expected_version",
  ),
  "evidence.record": operationPolicy(
    "evidence.record",
    "reversible",
    "automatic_with_grant",
    "immutable_create",
  ),
  "memory.propose": operationPolicy(
    "memory.propose",
    "reversible",
    "automatic_with_grant",
    "immutable_create",
  ),
  "memory.revise": operationPolicy(
    "memory.revise",
    "reversible",
    "automatic_with_grant",
    "expected_version",
  ),
  "memory.import": operationPolicy(
    "memory.import",
    "sensitive",
    "owner_only",
    "expected_version",
  ),
  "memory.review": operationPolicy(
    "memory.review",
    "sensitive",
    "owner_only",
    "expected_version",
  ),
  "memory.verify": operationPolicy(
    "memory.verify",
    "sensitive",
    "owner_only",
    "expected_version",
  ),
  "instruction.approve": operationPolicy(
    "instruction.approve",
    "sensitive",
    "owner_only",
    "expected_version",
  ),
  "configuration.record": operationPolicy(
    "configuration.record",
    "reversible",
    "automatic_with_grant",
    "immutable_create",
  ),
  "evaluation.record": operationPolicy(
    "evaluation.record",
    "reversible",
    "automatic_with_grant",
    "immutable_create",
  ),
} satisfies Record<FoundationOperation, FoundationOperationPolicy>);

export function foundationTokenDigest(token: string): string {
  if (
    typeof token !== "string" ||
    token.length !== 46 ||
    !/^af_[A-Za-z0-9_-]{43}$/.test(token)
  ) {
    throw new FoundationError(
      "INVALID_CREDENTIAL",
      "Invalid foundation credential",
    );
  }
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function canonicalFoundationJson(value: unknown): string {
  const ancestors = new Set<object>();
  function encode(current: unknown): string {
    if (current === null) return "null";
    if (typeof current === "string" || typeof current === "boolean") {
      return JSON.stringify(current);
    }
    if (typeof current === "number" && Number.isFinite(current)) {
      return JSON.stringify(current);
    }
    if (typeof current !== "object" || current === null) {
      throw new TypeError("Foundation values must contain only JSON data");
    }
    const array = Array.isArray(current);
    const prototype = Object.getPrototypeOf(current);
    if (
      (array && prototype !== Array.prototype) ||
      (!array && prototype !== Object.prototype && prototype !== null)
    ) {
      throw new TypeError(
        "Foundation values must use plain JSON objects and arrays",
      );
    }
    if (ancestors.has(current))
      throw new TypeError("Foundation values cannot be cyclic");
    if (Object.getOwnPropertySymbols(current).length > 0) {
      throw new TypeError("Foundation values cannot have symbol keys");
    }
    const properties = Object.getOwnPropertyDescriptors(current);
    const keys = Object.keys(properties);
    for (const key of keys) {
      if (array && key === "length") continue;
      const property = properties[key]!;
      if (!property.enumerable || !Object.hasOwn(property, "value")) {
        throw new TypeError(
          "Foundation values cannot have hidden or accessor properties",
        );
      }
    }
    ancestors.add(current);
    try {
      if (array) {
        const elements: string[] = [];
        if (keys.length !== current.length + 1) {
          throw new TypeError(
            "Foundation arrays must be dense and have only index keys",
          );
        }
        for (let index = 0; index < current.length; index += 1) {
          const property = properties[String(index)];
          if (!property) throw new TypeError("Foundation arrays must be dense");
          elements.push(encode(property.value));
        }
        return "[" + elements.join(",") + "]";
      }
      return (
        "{" +
        keys
          .sort()
          .map(
            (key) => JSON.stringify(key) + ":" + encode(properties[key]!.value),
          )
          .join(",") +
        "}"
      );
    } finally {
      ancestors.delete(current);
    }
  }
  return encode(value);
}

export function foundationDigest(value: unknown): string {
  return createHash("sha256")
    .update(canonicalFoundationJson(value), "utf8")
    .digest("hex");
}

export function foundationInstantMilliseconds(
  value: FoundationInstant,
): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== "string") return Number.NaN;
  const parts =
    /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(
      value,
    );
  if (!parts || parts[0] !== value) return Number.NaN;
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth =
    month === 2
      ? leapYear
        ? 29
        : 28
      : [4, 6, 9, 11].includes(month)
        ? 30
        : 31;
  // Date.parse normalizes impossible calendar days, so validate before conversion.
  if (day > daysInMonth) return Number.NaN;
  // Parse an exact millisecond prefix. V8 can misread long fractional fields;
  // authorization must never round an already expired instant into the future.
  const milliseconds = value.replace(
    /\.(\d+)(?=Z|[+-]\d{2}:\d{2}$)/,
    (_, digits: string) => `.${digits.slice(0, 3).padEnd(3, "0")}`,
  );
  return Date.parse(milliseconds);
}

export function requireFoundationGrant(
  grant: FoundationGrant,
  request: FoundationAuthorizationRequest,
): void {
  const now = request.now instanceof Date ? request.now.getTime() : Number.NaN;
  const expiry = foundationInstantMilliseconds(grant.expiresAt);
  const revoked =
    grant.revokedAt === null
      ? null
      : foundationInstantMilliseconds(grant.revokedAt);
  if (
    !Number.isFinite(now) ||
    !Number.isFinite(expiry) ||
    (revoked !== null && !Number.isFinite(revoked))
  ) {
    throw new FoundationError(
      "FORBIDDEN",
      "Authorization requires valid dates",
    );
  }
  if (revoked !== null)
    throw new FoundationError("REVOKED", "Foundation grant is revoked");
  if (expiry <= now)
    throw new FoundationError("EXPIRED", "Foundation grant has expired");
  if (
    grant.projectId !== request.projectId ||
    grant.environment !== request.environment
  ) {
    throw new FoundationError(
      "FORBIDDEN",
      "Foundation grant scope does not match",
    );
  }
  if (
    !Object.hasOwn(FOUNDATION_OPERATION_POLICIES, request.operation) ||
    !grant.operations.includes(request.operation)
  ) {
    throw new FoundationError(
      "FORBIDDEN",
      "Foundation operation is not granted",
    );
  }
  if (
    FOUNDATION_OPERATION_POLICIES[request.operation].approval === "owner_only"
  ) {
    throw new FoundationError(
      "FORBIDDEN",
      "Foundation operation requires the owner",
    );
  }
}

export function requireFoundationVersion(
  current: number,
  expected: number,
): void {
  if (
    !Number.isSafeInteger(current) ||
    current < 1 ||
    !Number.isSafeInteger(expected) ||
    expected < 1 ||
    current !== expected
  ) {
    throw new FoundationError(
      "VERSION_CONFLICT",
      "Foundation version does not match",
    );
  }
}

export type FoundationReviewMemory = {
  category: "finding" | "preference" | "instruction" | "decision";
  lifecycle: "proposed" | "accepted" | "rejected" | "superseded";
  verification: "unverified" | "source_matched" | "independently_verified";
  version: number;
  contentDigest: string;
  hasUnresolvedContradictions: boolean;
};

export type FoundationInstructionApproval = {
  version: number;
  contentDigest: string;
  expiresAt: FoundationInstant;
  disclosureProjectId: string;
};

export function requireFoundationReview(
  memory: FoundationReviewMemory,
  approval: FoundationInstructionApproval | null,
  projectId: string,
  now: Date,
): void {
  const currentTime = now instanceof Date ? now.getTime() : Number.NaN;
  if (!Number.isFinite(currentTime)) {
    throw new FoundationError(
      "FORBIDDEN",
      "Review selection requires a valid time",
    );
  }
  if (
    !["finding", "preference", "instruction", "decision"].includes(
      memory.category,
    ) ||
    memory.lifecycle !== "accepted" ||
    memory.hasUnresolvedContradictions !== false
  ) {
    throw new FoundationError(
      "FORBIDDEN",
      "Memory must be accepted and free of unresolved contradictions",
    );
  }
  requireFoundationVersion(memory.version, memory.version);
  if (
    typeof memory.contentDigest !== "string" ||
    memory.contentDigest.length !== 64 ||
    !/^[a-f0-9]{64}$/.test(memory.contentDigest)
  ) {
    throw new FoundationError(
      "INVALID_REFERENCE",
      "Memory requires a valid content digest",
    );
  }
  if (memory.category !== "instruction") return;
  if (!approval)
    throw new FoundationError(
      "APPROVAL_REQUIRED",
      "Instruction requires owner approval",
    );
  const expiry = foundationInstantMilliseconds(approval.expiresAt);
  if (
    !Number.isSafeInteger(approval.version) ||
    approval.version < 1 ||
    approval.version !== memory.version ||
    approval.contentDigest !== memory.contentDigest ||
    approval.disclosureProjectId !== projectId ||
    !Number.isFinite(expiry) ||
    expiry <= currentTime
  ) {
    throw new FoundationError(
      "APPROVAL_REQUIRED",
      "Instruction requires an exact live approval for this project",
    );
  }
}
