import {
  foundationActorSchema,
  foundationOperationSchema,
} from "@commandry/contracts";
import {
  FoundationError,
  canonicalFoundationJson,
  foundationInstantMilliseconds,
  type FoundationEnvironment,
  type FoundationOperation,
} from "@commandry/domain";
import { foundationWorkflowSnapshot } from "./foundation-workflow-access";

export type FoundationWorkflowPageBinding = {
  projectId: string;
  environment: FoundationEnvironment;
  principalId: string;
  operation: FoundationOperation;
};
type Selection = { asOf: string; afterId: string | null };

function invalid(): never {
  throw new FoundationError(
    "INVALID_REFERENCE",
    "Invalid workflow continuation",
  );
}
function exactKeys(value: object, keys: string[]): void {
  if (Object.keys(value).sort().join("|") !== [...keys].sort().join("|"))
    invalid();
}
function bindingValue(
  raw: FoundationWorkflowPageBinding,
): FoundationWorkflowPageBinding {
  const value = foundationWorkflowSnapshot(raw, invalid);
  try {
    exactKeys(value, ["projectId", "environment", "principalId", "operation"]);
    return {
      projectId: foundationActorSchema.shape.projectId.parse(value.projectId),
      environment: foundationActorSchema.shape.environment.parse(
        value.environment,
      ),
      principalId: foundationActorSchema.shape.principalId.parse(
        value.principalId,
      ),
      operation: foundationOperationSchema.parse(value.operation),
    };
  } catch {
    return invalid();
  }
}
function identity(value: unknown): string {
  try {
    const parsed = foundationActorSchema.shape.projectId.parse(value);
    if (parsed !== value) invalid();
    return parsed;
  } catch {
    return invalid();
  }
}
function instant(value: unknown): string {
  try {
    const parsed = foundationActorSchema.shape.expiresAt.parse(value);
    if (!Number.isFinite(foundationInstantMilliseconds(parsed))) invalid();
    return parsed;
  } catch {
    return invalid();
  }
}

/** Encoding binds a continuation to its caller and scope, not to authorization.
 * Adapters independently reauthorize and validate anchor membership and cutoff. */
export function foundationWorkflowPageSelection(
  binding: FoundationWorkflowPageBinding,
  cursor: string | undefined,
  now: Date,
): Selection {
  const scope = bindingValue(binding);
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) invalid();
  if (cursor === undefined) return { asOf: now.toISOString(), afterId: null };
  if (
    typeof cursor !== "string" ||
    cursor.length === 0 ||
    cursor.length > 8192 ||
    !/^[A-Za-z0-9_-]+$/.test(cursor)
  )
    invalid();
  try {
    const bytes = Buffer.from(cursor, "base64url");
    if (bytes.toString("base64url") !== cursor) invalid();
    const json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const value: unknown = JSON.parse(json);
    if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
    exactKeys(value, [
      "schemaVersion",
      "projectId",
      "environment",
      "principalId",
      "operation",
      "asOf",
      "afterId",
    ]);
    if (canonicalFoundationJson(value) !== json) invalid();
    const data = value as Record<string, unknown>;
    if (
      data.schemaVersion !== 1 ||
      data.projectId !== scope.projectId ||
      data.environment !== scope.environment ||
      data.principalId !== scope.principalId ||
      data.operation !== scope.operation
    )
      invalid();
    identity(data.projectId);
    const asOf = instant(data.asOf);
    const milliseconds = foundationInstantMilliseconds(asOf);
    const remainder = (asOf.match(/\.(\d+)/)?.[1] ?? "").slice(3);
    if (
      milliseconds > now.getTime() ||
      (milliseconds === now.getTime() && /[1-9]/.test(remainder))
    )
      invalid();
    return { asOf, afterId: identity(data.afterId) };
  } catch {
    return invalid();
  }
}

export function foundationWorkflowPageCursor(
  binding: FoundationWorkflowPageBinding,
  selection: Selection,
  afterId: string,
): string {
  const scope = bindingValue(binding);
  const value = foundationWorkflowSnapshot(selection, invalid);
  if (!value || typeof value !== "object") invalid();
  exactKeys(value, ["asOf", "afterId"]);
  if (value.afterId !== null) identity(value.afterId);
  const result = Buffer.from(
    canonicalFoundationJson({
      schemaVersion: 1,
      ...scope,
      asOf: instant(value.asOf),
      afterId: identity(afterId),
    }),
    "utf8",
  ).toString("base64url");
  if (result.length > 8192) invalid();
  return result;
}
