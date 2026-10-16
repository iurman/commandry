import { createHash } from "node:crypto";
import {
  foundationActorSchema,
  foundationAliasSchema,
  foundationEvidenceSchema,
  foundationIdempotencyKeySchema,
  foundationMemorySchema,
  type FoundationAlias,
  type FoundationMemory,
} from "@commandry/contracts";
import {
  canonicalFoundationJson,
  FoundationError,
  foundationDigest,
  foundationInstantMilliseconds,
} from "@commandry/domain";
import type {
  FoundationIdentity,
  FoundationMutationResult,
  FoundationOwnerRequest,
  FoundationRecordPort,
  FoundationServiceOptions,
} from "./agent-foundation";
import {
  exact,
  proposeFoundationMemory,
  reviseFoundationMemory,
  runtime,
} from "./foundation-memory-writes";
import {
  parseMnemosyneImportEnvelope,
  planMnemosyneImport,
  type MnemosyneImportEnvelope,
  type MnemosyneImportExisting,
  type MnemosyneImportPlan,
  type MnemosyneImportRecordPlan,
} from "./mnemosyne-import-preview";

export type FoundationImportSourceTier =
  "public" | "private" | "client" | "unknown";
export type FoundationImportRevision = {
  schemaVersion: 1;
  id: string;
  projectId: string;
  alias: FoundationAlias;
  memoryId: string;
  memoryVersion: number;
  sourceFingerprint: string;
  selectionFingerprint: string;
  memoryContentDigest: string;
  sourceTier: FoundationImportSourceTier;
  sourceCount: number;
  reviewedBy: string;
  reviewedAt: string;
  recordedAt: string;
  environment: FoundationServiceOptions["environment"];
  correlationId: string;
};
export type FoundationImportOriginalSource = {
  revisionId: string;
  projectId: string;
  ordinal: number;
  evidenceId: string;
  contentDigest: string;
  originalContent: string;
};
export type FoundationImportExisting = {
  alias: FoundationAlias;
  memory: FoundationMemory;
  baseline: FoundationImportRevision | null;
};
export type FoundationImportExpectedMemory = Pick<
  FoundationMemory,
  "id" | "version" | "contentDigest" | "knowledgeItemId"
>;
export type FoundationImportReviewedSelection = {
  externalId: string;
  selectionFingerprint: string;
  expectedExistingMemory: FoundationImportExpectedMemory | null;
};
export type MnemosyneSelectedImportInput = {
  envelope: MnemosyneImportEnvelope;
  decision: "apply_proposed_unverified";
  reviewedSelections: FoundationImportReviewedSelection[];
};
export type FoundationImportSummary = {
  externalId: string;
  sourceTier: FoundationImportSourceTier;
  sourceFingerprint: string;
  selectionFingerprint: string;
  action: "created" | "revised" | "unchanged";
  memoryId: string;
  version: number;
  contentDigest: string;
  importRevisionId: string;
  sourceCount: number;
};
export type FoundationImportReceipt = {
  schemaVersion: 1;
  id: string;
  projectId: string;
  namespace: string;
  appliedBy: string;
  recordedAt: string;
  records: FoundationImportSummary[];
};
export type FoundationImportOriginalQuery = {
  projectId: string;
  revisionId: string;
  /** Inclusive zero-based ordinal. Pass nextOrdinal unchanged to continue. */
  fromOrdinal: number;
  limit: number;
};
export type FoundationImportOriginalPage = {
  items: FoundationImportOriginalSource[];
  nextOrdinal: number | null;
};

/** All methods use the enclosing owner's single transaction and exact project.
 * Alias lookup locks the current head and returns its latest immutable import
 * baseline. The adapter must retain historical canonical source resolution.
 * Insertion atomically creates a revision and its COMPLETE ordered membership;
 * originals are byte-preserved UTF8, including empty strings and NUL, in bytea.
 * Receipts contain only safe summaries. No method authenticates its caller. */
export interface FoundationImportRecordPort extends FoundationRecordPort {
  getImportExisting(input: {
    projectId: string;
    alias: FoundationAlias;
  }): Promise<FoundationImportExisting | null>;
  insertImportRevision(input: {
    revision: FoundationImportRevision;
    sources: readonly FoundationImportOriginalSource[];
  }): Promise<{
    revision: FoundationImportRevision;
    sources: FoundationImportOriginalSource[];
  }>;
  getImportRevision(input: {
    projectId: string;
    id: string;
  }): Promise<FoundationImportRevision | null>;
  listImportOriginalSources(
    input: FoundationImportOriginalQuery,
  ): Promise<FoundationImportOriginalPage>;
}
/** One transaction, foundation-memory:<project> lock through receipts and audit,
 * no nested pool access. Revalidate the live trusted session under its adapter's
 * authentication model; rollback writes on callback/output/audit failure and
 * check expiry after the audit and before committing. A post-return expiry
 * rejection cannot undo a transaction already committed by the adapter. */
export interface FoundationSelectedImportPort {
  withOwner<T>(
    request: FoundationOwnerRequest,
    callback: (records: FoundationImportRecordPort) => Promise<T>,
  ): Promise<T>;
}

const ids = foundationActorSchema.shape.projectId;
const digests = foundationMemorySchema.shape.contentDigest;
const dates = foundationActorSchema.shape.expiresAt;
const aliases = foundationAliasSchema;
const textDigest = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex");
const maximumBytes = 8 * 1024 * 1024;
function invalid(): never {
  throw new FoundationError(
    "INVALID_REFERENCE",
    "Invalid selected import request or result",
  );
}
function canonical<T>(raw: T): T {
  try {
    const json = canonicalFoundationJson(raw);
    const value: unknown = JSON.parse(json);
    function unicode(item: unknown): void {
      if (typeof item === "string") {
        if (Buffer.from(item, "utf8").toString("utf8") !== item) invalid();
      } else if (item !== null && typeof item === "object") {
        for (const [key, child] of Object.entries(item)) {
          unicode(key);
          unicode(child);
        }
      }
    }
    unicode(value);
    return value as T;
  } catch {
    invalid();
  }
}
// The byte budget governs external requests, not derived plans or persistence
// wrappers. Internal snapshots still use the same lossless JSON validation.
function requestSnapshot<T>(raw: T): T {
  try {
    const json = canonicalFoundationJson(raw);
    if (Buffer.byteLength(json, "utf8") > maximumBytes) invalid();
    return canonical(JSON.parse(json) as T);
  } catch {
    invalid();
  }
}
function object(
  raw: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) invalid();
  const result = raw as Record<string, unknown>;
  if (
    Object.keys(result).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(result, key))
  )
    invalid();
  return result;
}
function integer(raw: unknown, minimum: number, maximum: number): number {
  if (
    typeof raw !== "number" ||
    !Number.isSafeInteger(raw) ||
    raw < minimum ||
    raw > maximum
  )
    invalid();
  return raw;
}
function tier(raw: unknown): FoundationImportSourceTier {
  if (
    raw !== "public" &&
    raw !== "private" &&
    raw !== "client" &&
    raw !== "unknown"
  )
    invalid();
  return raw;
}
function equal(actual: unknown, expected: unknown): void {
  if (foundationDigest(actual) !== foundationDigest(expected)) invalid();
}
function safe<T>(action: () => T): T {
  try {
    return action();
  } catch (error) {
    if (error instanceof FoundationError) throw error;
    invalid();
  }
}

/** A storage or delivery fault must never look like a rejected owner decision. */
export class FoundationImportUnavailableError extends FoundationError {
  constructor() {
    super("INVALID_REFERENCE", "Selected import output unavailable");
    this.name = "FoundationImportUnavailableError";
  }
}

function storedOutput<T>(action: () => T): T {
  try {
    return action();
  } catch {
    throw new FoundationImportUnavailableError();
  }
}
function exactParsed<T>(raw: unknown, parsed: T): T {
  equal(raw, parsed);
  return parsed;
}

export function parseFoundationImportRevision(
  raw: unknown,
): FoundationImportRevision {
  return safe(() => {
    const value = canonical(raw);
    const r = object(value, [
      "schemaVersion",
      "id",
      "projectId",
      "alias",
      "memoryId",
      "memoryVersion",
      "sourceFingerprint",
      "selectionFingerprint",
      "memoryContentDigest",
      "sourceTier",
      "sourceCount",
      "reviewedBy",
      "reviewedAt",
      "recordedAt",
      "environment",
      "correlationId",
    ]);
    if (r.schemaVersion !== 1) invalid();
    const revision: FoundationImportRevision = {
      schemaVersion: 1,
      id: ids.parse(r.id),
      projectId: ids.parse(r.projectId),
      alias: aliases.parse(r.alias),
      memoryId: ids.parse(r.memoryId),
      memoryVersion: integer(r.memoryVersion, 1, Number.MAX_SAFE_INTEGER),
      sourceFingerprint: digests.parse(r.sourceFingerprint),
      selectionFingerprint: digests.parse(r.selectionFingerprint),
      memoryContentDigest: digests.parse(r.memoryContentDigest),
      sourceTier: tier(r.sourceTier),
      sourceCount: integer(r.sourceCount, 1, 1000),
      reviewedBy: foundationActorSchema.shape.principalId.parse(r.reviewedBy),
      reviewedAt: dates.parse(r.reviewedAt),
      recordedAt: dates.parse(r.recordedAt),
      environment: foundationActorSchema.shape.environment.parse(r.environment),
      correlationId: ids.parse(r.correlationId),
    };
    if (
      foundationInstantMilliseconds(revision.reviewedAt) >
      foundationInstantMilliseconds(revision.recordedAt)
    )
      invalid();
    return exactParsed(value, revision);
  });
}
export function parseFoundationImportOriginalSource(
  raw: unknown,
): FoundationImportOriginalSource {
  return safe(() => {
    const value = canonical(raw);
    const r = object(value, [
      "revisionId",
      "projectId",
      "ordinal",
      "evidenceId",
      "contentDigest",
      "originalContent",
    ]);
    if (typeof r.originalContent !== "string") invalid();
    const source: FoundationImportOriginalSource = {
      revisionId: ids.parse(r.revisionId),
      projectId: ids.parse(r.projectId),
      ordinal: integer(r.ordinal, 0, 999),
      evidenceId: ids.parse(r.evidenceId),
      contentDigest: digests.parse(r.contentDigest),
      originalContent: r.originalContent,
    };
    if (textDigest(source.originalContent) !== source.contentDigest) invalid();
    return exactParsed(value, source);
  });
}
function envelope(raw: unknown): MnemosyneImportEnvelope {
  const result = parseMnemosyneImportEnvelope(canonical(raw));
  if (
    result.records.reduce((count, row) => count + row.sources.length, 0) > 1000
  )
    invalid();
  return result;
}
function expectedMemory(raw: unknown): FoundationImportExpectedMemory | null {
  if (raw === null) return null;
  const value = object(raw, [
    "id",
    "version",
    "contentDigest",
    "knowledgeItemId",
  ]);
  return {
    id: ids.parse(value.id),
    version: integer(value.version, 1, Number.MAX_SAFE_INTEGER),
    contentDigest: digests.parse(value.contentDigest),
    knowledgeItemId: ids.parse(value.knowledgeItemId),
  };
}
function input(raw: unknown): MnemosyneSelectedImportInput {
  return safe(() => {
    const value = object(requestSnapshot(raw), [
      "envelope",
      "decision",
      "reviewedSelections",
    ]);
    if (
      value.decision !== "apply_proposed_unverified" ||
      !Array.isArray(value.reviewedSelections) ||
      value.reviewedSelections.length > 1000
    )
      invalid();
    const parsed = envelope(value.envelope);
    const selections = value.reviewedSelections.map((rawSelection) => {
      const r = object(rawSelection, [
        "externalId",
        "selectionFingerprint",
        "expectedExistingMemory",
      ]);
      return {
        externalId: aliases.shape.externalId.parse(r.externalId),
        selectionFingerprint: digests.parse(r.selectionFingerprint),
        expectedExistingMemory: expectedMemory(r.expectedExistingMemory),
      };
    });
    const selected = parsed.records.filter((row) => row.selected);
    const reviewed = new Map(selections.map((s) => [s.externalId, s]));
    if (
      selected.length === 0 ||
      reviewed.size !== selections.length ||
      selections.length !== selected.length ||
      selected.some((row) => !reviewed.has(row.externalId))
    )
      invalid();
    const plan = planMnemosyneImport(parsed, {
      projectId: parsed.projectId,
      reviewedSelections: new Map(
        selections.map((s) => [s.externalId, s.selectionFingerprint]),
      ),
      existing: [],
    });
    if (
      plan.records.some(
        (row) =>
          row.selected && (!row.reviewedSelection || !row.originalsAvailable),
      )
    )
      invalid();
    return {
      envelope: parsed,
      decision: "apply_proposed_unverified",
      reviewedSelections: selections,
    };
  });
}
function parseSummary(raw: unknown): FoundationImportSummary {
  const r = object(raw, [
    "externalId",
    "sourceTier",
    "sourceFingerprint",
    "selectionFingerprint",
    "action",
    "memoryId",
    "version",
    "contentDigest",
    "importRevisionId",
    "sourceCount",
  ]);
  if (
    r.action !== "created" &&
    r.action !== "revised" &&
    r.action !== "unchanged"
  )
    invalid();
  return exactParsed(raw, {
    externalId: aliases.shape.externalId.parse(r.externalId),
    sourceTier: tier(r.sourceTier),
    sourceFingerprint: digests.parse(r.sourceFingerprint),
    selectionFingerprint: digests.parse(r.selectionFingerprint),
    action: r.action,
    memoryId: ids.parse(r.memoryId),
    version: integer(r.version, 1, Number.MAX_SAFE_INTEGER),
    contentDigest: digests.parse(r.contentDigest),
    importRevisionId: ids.parse(r.importRevisionId),
    sourceCount: integer(r.sourceCount, 1, 1000),
  });
}
function bindReceipt(
  raw: unknown,
  request: MnemosyneSelectedImportInput,
  principal: string,
): { record: FoundationImportReceipt; correlationId: string } {
  return safe(() => {
    const value = canonical(raw);
    const r = object(value, ["record", "correlationId"]);
    const b = object(r.record, [
      "schemaVersion",
      "id",
      "projectId",
      "namespace",
      "appliedBy",
      "recordedAt",
      "records",
    ]);
    if (b.schemaVersion !== 1 || !Array.isArray(b.records)) invalid();
    const record: FoundationImportReceipt = {
      schemaVersion: 1,
      id: ids.parse(b.id),
      projectId: ids.parse(b.projectId),
      namespace: aliases.shape.namespace.parse(b.namespace),
      appliedBy: foundationActorSchema.shape.principalId.parse(b.appliedBy),
      recordedAt: dates.parse(b.recordedAt),
      records: b.records.map(parseSummary),
    };
    const correlationId = ids.parse(r.correlationId);
    const e = request.envelope;
    if (
      record.projectId !== e.projectId ||
      record.namespace !== e.namespace ||
      record.appliedBy !== principal ||
      record.id !== correlationId
    )
      invalid();
    const plan = planMnemosyneImport(e, {
      projectId: e.projectId,
      existing: [],
      reviewedSelections: new Map(),
    }).records.filter((row) => row.selected);
    if (record.records.length !== plan.length) invalid();
    const reviews = new Map(
      request.reviewedSelections.map((s) => [s.externalId, s]),
    );
    const memoryIds = new Set<string>();
    const revisionIds = new Set<string>();
    for (let index = 0; index < plan.length; index += 1) {
      const row = plan[index]!;
      const summary = record.records[index]!;
      const prior = reviews.get(row.alias.externalId)!.expectedExistingMemory;
      equal(
        {
          externalId: summary.externalId,
          sourceTier: summary.sourceTier,
          sourceFingerprint: summary.sourceFingerprint,
          selectionFingerprint: summary.selectionFingerprint,
          sourceCount: summary.sourceCount,
        },
        {
          externalId: row.alias.externalId,
          sourceTier: row.sourceTier,
          sourceFingerprint: row.sourceFingerprint,
          selectionFingerprint: row.selectionFingerprint,
          sourceCount: row.sources.length,
        },
      );
      if (
        memoryIds.has(summary.memoryId) ||
        revisionIds.has(summary.importRevisionId)
      )
        invalid();
      memoryIds.add(summary.memoryId);
      revisionIds.add(summary.importRevisionId);
      if (prior === null) {
        if (summary.action !== "created" || summary.version !== 1) invalid();
      } else if (
        summary.action === "created" ||
        summary.memoryId !== prior.id ||
        summary.version !==
          prior.version + (summary.action === "revised" ? 1 : 0) ||
        (summary.action === "unchanged" &&
          summary.contentDigest !== prior.contentDigest)
      )
        invalid();
    }
    return exactParsed(value, { record, correlationId });
  });
}

export function createMnemosyneSelectedImportService(
  port: FoundationSelectedImportPort,
  trustedOwnerIdentity: FoundationIdentity,
  options: FoundationServiceOptions,
) {
  const server = runtime(options);
  const identity = safe(() => {
    const r = object(canonical(trustedOwnerIdentity), [
      "principalId",
      "expiresAt",
    ]);
    return Object.freeze({
      principalId: foundationActorSchema.shape.principalId.parse(r.principalId),
      expiresAt: dates.parse(r.expiresAt),
    });
  });
  function session(): void {
    if (
      foundationInstantMilliseconds(identity.expiresAt) <=
      server.now().getTime()
    )
      throw new FoundationError("EXPIRED", "A live owner session is required");
  }
  async function checked<T>(action: Promise<T>): Promise<T> {
    const result = await action;
    session();
    return result;
  }
  async function storedRead<T>(action: Promise<T>): Promise<T> {
    try {
      return await checked(action);
    } catch (error) {
      if (
        error instanceof FoundationError &&
        error.code === "INVALID_REFERENCE"
      )
        throw new FoundationImportUnavailableError();
      throw error;
    }
  }
  async function run<T>(
    projectId: string,
    operation: "memory.import" | "foundation.read",
    targetId: string | null,
    action: (
      r: FoundationImportRecordPort,
      request: FoundationOwnerRequest,
    ) => Promise<T>,
  ): Promise<T> {
    session();
    const request: FoundationOwnerRequest = Object.freeze({
      ...identity,
      projectId,
      operation,
      targetId,
      environment: server.environment,
      correlationId: server.id(),
    });
    let callbacks = 0;
    let expectedDigest: string | undefined;
    const result = await port.withOwner({ ...request }, async (r) => {
      callbacks += 1;
      if (callbacks !== 1) invalid();
      session();
      const value = canonical(await action(r, request));
      session();
      expectedDigest = foundationDigest(value);
      return value;
    });
    session();
    return storedOutput(() => {
      if (callbacks !== 1 || expectedDigest === undefined) invalid();
      const value = canonical(result);
      if (foundationDigest(value) !== expectedDigest) invalid();
      return value;
    });
  }
  async function load(
    r: FoundationImportRecordPort,
    e: MnemosyneImportEnvelope,
  ) {
    const existing: MnemosyneImportExisting[] = [];
    const stored = new Map<string, FoundationImportExisting>();
    const memoryIds = new Set<string>();
    for (const row of e.records) {
      if (!row.selected) continue;
      const alias = { namespace: e.namespace, externalId: row.externalId };
      const received = await storedRead(
        r.getImportExisting({ projectId: e.projectId, alias: { ...alias } }),
      );
      const raw = storedOutput(() => canonical(received));
      if (raw === null) continue;
      storedOutput(() => {
        const item = object(raw, ["alias", "memory", "baseline"]);
        const memory = safe(() =>
          exactParsed(item.memory, foundationMemorySchema.parse(item.memory)),
        );
        equal(item.alias, alias);
        if (
          memory.projectId !== e.projectId ||
          memoryIds.has(memory.id) ||
          foundationDigest(memory.content) !== memory.contentDigest
        )
          invalid();
        memoryIds.add(memory.id);
        const baseline =
          item.baseline === null
            ? null
            : parseFoundationImportRevision(item.baseline);
        if (baseline !== null) {
          if (
            baseline.projectId !== e.projectId ||
            baseline.environment !== server.environment ||
            baseline.memoryId !== memory.id ||
            baseline.memoryVersion > memory.version
          )
            invalid();
          equal(baseline.alias, alias);
        }
        stored.set(row.externalId, { alias, memory, baseline });
        existing.push({
          alias,
          memory,
          importedSourceFingerprint: baseline?.sourceFingerprint ?? null,
          lastImportedMemoryDigest: baseline?.memoryContentDigest ?? null,
        });
      });
    }
    return { existing, stored };
  }
  function scopedRevision(raw: unknown, projectId: string, id: string) {
    if (raw === null)
      throw new FoundationError("NOT_FOUND", "Import revision is unavailable");
    return storedOutput(() => {
      const revision = parseFoundationImportRevision(raw);
      if (
        revision.projectId !== projectId ||
        revision.id !== id ||
        revision.environment !== server.environment
      )
        invalid();
      return revision;
    });
  }
  return {
    async preview(rawEnvelope: unknown): Promise<MnemosyneImportPlan> {
      const e = safe(() => envelope(requestSnapshot(rawEnvelope)));
      return run(e.projectId, "foundation.read", null, async (r) => {
        const { existing } = await load(r, e);
        return planMnemosyneImport(e, {
          projectId: e.projectId,
          reviewedSelections: new Map(),
          existing,
        });
      });
    },
    async apply(
      rawInput: unknown,
      rawKey: unknown,
    ): Promise<FoundationMutationResult<FoundationImportReceipt>> {
      const requestInput = input(rawInput);
      const key = safe(() => foundationIdempotencyKeySchema.parse(rawKey));
      const e = requestInput.envelope;
      return run(e.projectId, "memory.import", null, async (r, context) => {
        const digest = foundationDigest({
          operation: "memory.import",
          projectId: e.projectId,
          environment: server.environment,
          principalId: identity.principalId,
          input: requestInput,
        });
        const cached = await checked(
          r.idempotent(key, digest, async () => {
            const { existing, stored } = await load(r, e);
            const reviewedSelections = new Map(
              requestInput.reviewedSelections.map((s) => [
                s.externalId,
                s.selectionFingerprint,
              ]),
            );
            const plan = planMnemosyneImport(e, {
              projectId: e.projectId,
              existing,
              reviewedSelections,
            });
            const reviews = new Map(
              requestInput.reviewedSelections.map((s) => [s.externalId, s]),
            );
            const selected: MnemosyneImportRecordPlan[] = [];
            for (const row of plan.records) {
              if (!row.selected) continue;
              equal(
                row.expectedExistingMemory,
                reviews.get(row.alias.externalId)!.expectedExistingMemory,
              );
              if (
                !row.reviewedSelection ||
                !row.originalsAvailable ||
                (row.action !== "new_proposal" &&
                  row.action !== "unchanged" &&
                  !(
                    row.action === "revision_requires_review" &&
                    row.reason === "import_changed"
                  ))
              )
                invalid();
              for (const source of row.sources)
                await checked(r.validateEvidenceReference({ ...source }));
              selected.push(row);
            }
            const records: FoundationImportSummary[] = [];
            const writeContext = {
              ...server,
              principalId: identity.principalId,
              authorize: session,
            };
            for (const row of selected) {
              const original = e.records.find(
                (item) => item.externalId === row.alias.externalId,
              )!;
              const prior = stored.get(row.alias.externalId);
              if (row.action === "unchanged") {
                if (
                  !prior?.baseline ||
                  prior.baseline.sourceCount !== row.sources.length ||
                  prior.baseline.sourceTier !== row.sourceTier ||
                  prior.baseline.selectionFingerprint !==
                    row.selectionFingerprint
                )
                  invalid();
                records.push({
                  externalId: original.externalId,
                  sourceTier: row.sourceTier,
                  sourceFingerprint: row.sourceFingerprint,
                  selectionFingerprint: row.selectionFingerprint,
                  action: "unchanged",
                  memoryId: prior.memory.id,
                  version: prior.memory.version,
                  contentDigest: prior.memory.contentDigest,
                  importRevisionId: prior.baseline.id,
                  sourceCount: row.sources.length,
                });
                continue;
              }
              const evidenceIds: string[] = [];
              const revisionId = server.id();
              const originals: FoundationImportOriginalSource[] = [];
              for (
                let ordinal = 0;
                ordinal < original.sources.length;
                ordinal += 1
              ) {
                const source = original.sources[ordinal]!;
                if (source.originalContent === null) invalid();
                const evidence = foundationEvidenceSchema.parse({
                  ...source.evidence,
                  schemaVersion: 1,
                  id: server.id(),
                  ingestedAt: server.now().toISOString(),
                  recordedBy: identity.principalId,
                  verification: "unverified",
                });
                exact(
                  foundationEvidenceSchema,
                  canonical(
                    await checked(r.insertEvidence(structuredClone(evidence))),
                  ),
                  evidence,
                );
                evidenceIds.push(evidence.id);
                originals.push({
                  revisionId,
                  projectId: e.projectId,
                  ordinal,
                  evidenceId: evidence.id,
                  contentDigest: source.evidence.contentDigest,
                  originalContent: source.originalContent,
                });
              }
              const content = {
                statement: original.statement,
                category: original.category,
                evidenceIds,
                relatedMemoryIds: [],
                relationType: null,
              };
              const memory =
                prior === undefined
                  ? await proposeFoundationMemory(
                      r,
                      {
                        projectId: e.projectId,
                        knowledgeItemId: original.knowledgeItemId,
                        content,
                        alias: row.alias,
                      },
                      writeContext,
                    )
                  : await reviseFoundationMemory(
                      r,
                      {
                        projectId: e.projectId,
                        memoryId: prior.memory.id,
                        expectedVersion: prior.memory.version,
                        content,
                      },
                      { ...writeContext, expectedCurrent: prior.memory },
                    );
              session();
              if (memory.knowledgeItemId !== original.knowledgeItemId)
                invalid();
              const at = server.now().toISOString();
              const revision: FoundationImportRevision =
                parseFoundationImportRevision({
                  schemaVersion: 1,
                  id: revisionId,
                  projectId: e.projectId,
                  alias: row.alias,
                  memoryId: memory.id,
                  memoryVersion: memory.version,
                  sourceFingerprint: row.sourceFingerprint,
                  selectionFingerprint: row.selectionFingerprint,
                  memoryContentDigest: memory.contentDigest,
                  sourceTier: row.sourceTier,
                  sourceCount: originals.length,
                  reviewedBy: identity.principalId,
                  reviewedAt: at,
                  recordedAt: at,
                  environment: server.environment,
                  correlationId: context.correlationId,
                });
              const persisted = object(
                canonical(
                  await checked(
                    r.insertImportRevision({
                      revision: structuredClone(revision),
                      sources: structuredClone(originals),
                    }),
                  ),
                ),
                ["revision", "sources"],
              );
              equal(
                parseFoundationImportRevision(persisted.revision),
                revision,
              );
              if (!Array.isArray(persisted.sources)) invalid();
              equal(
                persisted.sources.map(parseFoundationImportOriginalSource),
                originals,
              );
              records.push({
                externalId: original.externalId,
                sourceTier: row.sourceTier,
                sourceFingerprint: row.sourceFingerprint,
                selectionFingerprint: row.selectionFingerprint,
                action: prior === undefined ? "created" : "revised",
                memoryId: memory.id,
                version: memory.version,
                contentDigest: memory.contentDigest,
                importRevisionId: revisionId,
                sourceCount: originals.length,
              });
            }
            const record: FoundationImportReceipt = {
              schemaVersion: 1,
              id: context.correlationId,
              projectId: e.projectId,
              namespace: e.namespace,
              appliedBy: identity.principalId,
              recordedAt: server.now().toISOString(),
              records,
            };
            return bindReceipt(
              { record, correlationId: context.correlationId },
              requestInput,
              identity.principalId,
            );
          }),
        );
        return storedOutput(() => {
          const value = object(canonical(cached), ["value", "replayed"]);
          if (typeof value.replayed !== "boolean") invalid();
          const bound = bindReceipt(
            value.value,
            requestInput,
            identity.principalId,
          );
          return { ...bound, replayed: value.replayed };
        });
      });
    },
    async getRevision(rawInput: unknown): Promise<FoundationImportRevision> {
      const value = safe(() =>
        object(requestSnapshot(rawInput), ["projectId", "id"]),
      );
      const projectId = safe(() => ids.parse(value.projectId));
      const id = safe(() => ids.parse(value.id));
      return run(projectId, "foundation.read", id, async (r) =>
        scopedRevision(
          await storedRead(r.getImportRevision({ projectId, id })),
          projectId,
          id,
        ),
      );
    },
    async listOriginalSources(
      rawInput: unknown,
    ): Promise<FoundationImportOriginalPage> {
      const value = requestSnapshot(rawInput);
      if (value === null || typeof value !== "object" || Array.isArray(value))
        invalid();
      const q = value as Record<string, unknown>;
      if (
        Object.keys(q).some(
          (key) =>
            !["projectId", "revisionId", "fromOrdinal", "limit"].includes(key),
        ) ||
        !Object.hasOwn(q, "projectId") ||
        !Object.hasOwn(q, "revisionId")
      )
        invalid();
      const query: FoundationImportOriginalQuery = safe(() => ({
        projectId: ids.parse(q.projectId),
        revisionId: ids.parse(q.revisionId),
        fromOrdinal: integer(
          q.fromOrdinal === undefined ? 0 : q.fromOrdinal,
          0,
          1000,
        ),
        limit: integer(q.limit === undefined ? 100 : q.limit, 1, 1000),
      }));
      return run(
        query.projectId,
        "foundation.read",
        query.revisionId,
        async (r) => {
          const revision = scopedRevision(
            await storedRead(
              r.getImportRevision({
                projectId: query.projectId,
                id: query.revisionId,
              }),
            ),
            query.projectId,
            query.revisionId,
          );
          if (query.fromOrdinal > revision.sourceCount) invalid();
          const rawPage = await storedRead(
            r.listImportOriginalSources({ ...query }),
          );
          return storedOutput(() => {
            const page = object(canonical(rawPage), ["items", "nextOrdinal"]);
            if (!Array.isArray(page.items)) invalid();
            const items = page.items.map(parseFoundationImportOriginalSource);
            const count = Math.min(
              query.limit,
              revision.sourceCount - query.fromOrdinal,
            );
            if (items.length !== count) invalid();
            for (let offset = 0; offset < items.length; offset += 1) {
              const source = items[offset]!;
              if (
                source.projectId !== query.projectId ||
                source.revisionId !== query.revisionId ||
                source.ordinal !== query.fromOrdinal + offset
              )
                invalid();
            }
            const nextOrdinal =
              query.fromOrdinal + count < revision.sourceCount
                ? query.fromOrdinal + count
                : null;
            if (page.nextOrdinal !== nextOrdinal) invalid();
            return { items, nextOrdinal };
          });
        },
      );
    },
  };
}
