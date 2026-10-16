import { randomUUID } from "node:crypto";
import {
  foundationActorSchema,
  foundationEvidenceSchema,
  foundationMemorySchema,
  foundationProposeMemorySchema,
  foundationReviseMemorySchema,
  type FoundationProposeMemory,
  type FoundationReviseMemory,
  type FoundationMemory,
} from "@commandry/contracts";
import {
  FoundationError,
  foundationDigest,
  requireFoundationVersion,
} from "@commandry/domain";
import type {
  FoundationAnchor,
  FoundationRecordPort,
  FoundationServiceOptions,
} from "./agent-foundation";

type Parser<T> = { parse(value: unknown): T };
type ScopedRecord = { id: string; projectId: string };

export function runtime(options: FoundationServiceOptions) {
  const environment = foundationActorSchema.shape.environment.parse(
    options.environment,
  );
  const clock = options.now ?? (() => new Date());
  const createId = options.createId ?? randomUUID;
  return {
    environment,
    now() {
      const value = clock();
      if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
        throw new FoundationError(
          "FORBIDDEN",
          "A valid server time is required",
        );
      }
      return new Date(value.getTime());
    },
    id: () => foundationActorSchema.shape.correlationId.parse(createId()),
  };
}

export function notFound(): never {
  throw new FoundationError("NOT_FOUND", "Foundation record is unavailable");
}

export function scoped<T extends ScopedRecord>(
  schema: Parser<T>,
  value: unknown,
  projectId: string,
  id?: string,
): T {
  if (value === null) notFound();
  const record = schema.parse(value);
  if (
    record.projectId !== projectId ||
    (id !== undefined && record.id !== id)
  ) {
    notFound();
  }
  return record;
}

export function exact<T>(schema: Parser<T>, value: unknown, expected: T): T {
  const rawDigest = foundationDigest(value);
  const record = schema.parse(value);
  if (
    rawDigest !== foundationDigest(record) ||
    foundationDigest(record) !== foundationDigest(expected)
  ) {
    throw new FoundationError("INVALID_REFERENCE", "Invalid foundation result");
  }
  return record;
}

export function anchorFor(
  anchor: FoundationAnchor,
  knowledgeItemId: string,
  evidenceIds: readonly string[],
  fresh = false,
): FoundationAnchor {
  if (
    !anchor ||
    anchor.knowledgeItemId !== knowledgeItemId ||
    !Number.isSafeInteger(anchor.knowledgeVersion) ||
    anchor.knowledgeVersion < 1 ||
    !foundationEvidenceSchema.shape.id.safeParse(anchor.evidenceId).success ||
    !evidenceIds.includes(anchor.evidenceId) ||
    !foundationEvidenceSchema.shape.sourceVersion.safeParse(
      anchor.sourceVersion,
    ).success ||
    !foundationEvidenceSchema.shape.contentDigest.safeParse(
      anchor.contentDigest,
    ).success ||
    !["fresh", "stale", "unknown"].includes(anchor.freshness) ||
    (fresh && anchor.freshness !== "fresh")
  ) {
    throw new FoundationError(
      "INVALID_REFERENCE",
      "Source anchor is unavailable",
    );
  }
  return {
    knowledgeItemId,
    knowledgeVersion: anchor.knowledgeVersion,
    evidenceId: anchor.evidenceId,
    sourceVersion: anchor.sourceVersion,
    contentDigest: anchor.contentDigest,
    freshness: anchor.freshness,
  };
}

/** Transaction-bound canonical writes. This context conveys attribution only;
 * the enclosing authenticated service and adapter remain responsible for authority. */
export type FoundationMemoryWriteContext = {
  principalId: string;
  id: () => string;
  now: () => Date;
  authorize?: () => void;
  expectedCurrent?: FoundationMemory;
};
async function checked<T>(
  context: FoundationMemoryWriteContext,
  action: Promise<T>,
): Promise<T> {
  const result = await action;
  context.authorize?.();
  return result;
}
export async function proposeFoundationMemory(
  r: FoundationRecordPort,
  raw: FoundationProposeMemory,
  context: FoundationMemoryWriteContext,
): Promise<FoundationMemory> {
  context.authorize?.();
  const input = foundationProposeMemorySchema.parse(raw);

  await checked(
    context,
    r.assertReferences({
      evidenceIds: [...input.content.evidenceIds],
      memoryIds: [...input.content.relatedMemoryIds],
      configurationIds: [],
    }),
  );
  const anchor = anchorFor(
    await checked(
      context,
      r.resolveMemoryAnchor(input.knowledgeItemId, [
        ...input.content.evidenceIds,
      ]),
    ),
    input.knowledgeItemId,
    input.content.evidenceIds,
  );
  const record = foundationMemorySchema.parse({
    schemaVersion: 1,
    id: context.id(),
    projectId: input.projectId,
    knowledgeItemId: input.knowledgeItemId,
    version: 1,
    contentDigest: foundationDigest(input.content),
    content: input.content,
    lifecycle: "proposed",
    verification: "unverified",
    recordedBy: context.principalId,
    recordedAt: context.now().toISOString(),
  });
  return exact(
    foundationMemorySchema,
    await checked(
      context,
      r.saveMemory(
        structuredClone(record),
        null,
        structuredClone(input.alias),
        structuredClone(anchor),
      ),
    ),
    record,
  );
}
export async function reviseFoundationMemory(
  r: FoundationRecordPort,
  raw: FoundationReviseMemory,
  context: FoundationMemoryWriteContext,
): Promise<FoundationMemory> {
  context.authorize?.();
  const input = foundationReviseMemorySchema.parse(raw);

  const current = scoped(
    foundationMemorySchema,
    await checked(context, r.getMemory(input.memoryId, true)),
    input.projectId,
    input.memoryId,
  );
  requireFoundationVersion(current.version, input.expectedVersion);
  if (context.expectedCurrent !== undefined)
    exact(foundationMemorySchema, current, context.expectedCurrent);
  await checked(
    context,
    r.assertReferences({
      evidenceIds: [...input.content.evidenceIds],
      memoryIds: [...input.content.relatedMemoryIds],
      configurationIds: [],
    }),
  );
  const anchor = anchorFor(
    await checked(
      context,
      r.resolveMemoryAnchor(current.knowledgeItemId, [
        ...input.content.evidenceIds,
      ]),
    ),
    current.knowledgeItemId,
    input.content.evidenceIds,
    true,
  );
  const record = foundationMemorySchema.parse({
    ...current,
    version: current.version + 1,
    content: input.content,
    contentDigest: foundationDigest(input.content),
    lifecycle: "proposed",
    verification: "unverified",
    recordedBy: context.principalId,
    recordedAt: context.now().toISOString(),
  });
  // null adds no alias; adapters retain existing aliases on revision.
  return exact(
    foundationMemorySchema,
    await checked(
      context,
      r.saveMemory(
        structuredClone(record),
        current.version,
        null,
        structuredClone(anchor),
      ),
    ),
    record,
  );
}
