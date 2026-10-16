import { createHash, randomBytes } from "node:crypto";
import {
  runtime,
  scoped,
  exact,
  notFound,
  anchorFor,
  proposeFoundationMemory,
  reviseFoundationMemory,
} from "./foundation-memory-writes";
import {
  foundationActorSchema,
  foundationApproveInstructionSchema,
  foundationClientSchema,
  foundationConfigurationSchema,
  foundationCreateClientSchema,
  foundationCreateConfigurationSchema,
  foundationEvidenceInputSchema,
  foundationEvidenceSchema,
  foundationIdempotencyKeySchema,
  foundationInstructionApprovalSchema,
  foundationIssuedClientSchema,
  foundationMemorySchema,
  foundationOwnerMemoryReadSchema,
  foundationProposeMemorySchema,
  foundationReadRecordSchema,
  foundationReviewMemorySchema,
  foundationReviseMemorySchema,
  foundationRevokeClientSchema,
  foundationScopedPageSchema,
  foundationVerifyMemorySchema,
  type FoundationActor,
  type FoundationAlias,
  type FoundationClient,
  type FoundationConfiguration,
  type FoundationEvidence,
  type FoundationEvidenceInput,
  type FoundationInstructionApproval,
  type FoundationMemory,
  type FoundationReviewMemory,
  type FoundationScopedPage,
  type FoundationVerifyMemory,
} from "@commandry/contracts";
import {
  FOUNDATION_OPERATIONS,
  FoundationError,
  foundationInstantMilliseconds,
  foundationDigest,
  canonicalFoundationJson,
  foundationTokenDigest,
  requireFoundationGrant,
  requireFoundationReview,
  requireFoundationVersion,
  type FoundationEnvironment,
  type FoundationOperation,
} from "@commandry/domain";

// Trusted boundary: only an authenticated human session adapter supplies this.
// This shape is not proof of session authentication or session revocation.
export type FoundationIdentity = {
  principalId: string;
  expiresAt: string;
  sessionId?: string;
};
export type FoundationServiceOptions = {
  environment: FoundationEnvironment;
  now?: () => Date;
  createId?: () => string;
};
export type FoundationAnchor = {
  knowledgeItemId: string;
  knowledgeVersion: number;
  evidenceId: string;
  sourceVersion: string | null;
  contentDigest: string;
  freshness: "fresh" | "stale" | "unknown";
};
export type FoundationOperationContext = {
  operation: FoundationOperation;
  projectId: string;
  environment: FoundationEnvironment;
  correlationId: string;
  targetId: string | null;
};
export type FoundationMachineRequest = FoundationOperationContext & {
  tokenDigest: string;
};
export type FoundationOwnerRequest = FoundationOperationContext &
  FoundationIdentity;
export type FoundationMutationResult<T> = {
  record: T;
  replayed: boolean;
  correlationId: string;
};

/**
 * Bound to the outer transaction's exact project and principal. Adapters own
 * reference membership, source identity, grant locks, savepoint rollback,
 * provenance relations and atomic audits. No method grants cross-project access.
 */
export interface FoundationRecordPort {
  /** Persist immutable operation receipts with a canonical response digest and
   * verify that digest on replay, including opaque generated IDs/times and
   * correlation ID. Application checks additionally bind deterministic fields
   * to the strict request and principal; they do not replace storage integrity. */
  idempotent<T>(
    key: string,
    requestDigest: string,
    perform: () => Promise<T>,
  ): Promise<{ value: T; replayed: boolean }>;
  validateEvidenceReference(input: FoundationEvidenceInput): Promise<void>;
  assertReferences(input: {
    evidenceIds: readonly string[];
    memoryIds: readonly string[];
    configurationIds: readonly string[];
  }): Promise<void>;
  getEvidence(id: string): Promise<FoundationEvidence | null>;
  getMemory(id: string, lock: boolean): Promise<FoundationMemory | null>;
  getConfiguration(id: string): Promise<FoundationConfiguration | null>;
  resolveMemoryAnchor(
    knowledgeItemId: string,
    evidenceIds: readonly string[],
  ): Promise<FoundationAnchor>;
  getMemoryAnchor(memoryId: string): Promise<FoundationAnchor>;
  hasUnresolvedContradictions(memoryId: string): Promise<boolean>;
  insertEvidence(record: FoundationEvidence): Promise<FoundationEvidence>;
  saveMemory(
    record: FoundationMemory,
    expectedVersion: number | null,
    alias: FoundationAlias | null,
    anchor: FoundationAnchor,
  ): Promise<FoundationMemory>;
  reviewMemory(
    input: FoundationReviewMemory,
    actor: FoundationActor,
    at: string,
  ): Promise<FoundationMemory>;
  verifyMemory(
    input: FoundationVerifyMemory,
    actor: FoundationActor,
    at: string,
  ): Promise<FoundationMemory>;
  insertInstructionApproval(
    record: FoundationInstructionApproval,
  ): Promise<FoundationInstructionApproval>;
  insertConfiguration(
    record: FoundationConfiguration,
  ): Promise<FoundationConfiguration>;
}

/**
 * withClient holds a shared grant lock through callback, idempotency and audit;
 * revocation takes an incompatible lock on that same row. Both wrappers must
 * roll back callback writes on denial, invalid output or audit failure. Owner
 * management entry points recheck trusted session expiry after their own locks.
 */
export interface FoundationAccessPort {
  withClient<T>(
    request: FoundationMachineRequest,
    action: (
      client: FoundationClient,
      records: FoundationRecordPort,
    ) => Promise<T>,
  ): Promise<T>;
  withOwner<T>(
    request: FoundationOwnerRequest,
    action: (records: FoundationRecordPort) => Promise<T>,
  ): Promise<T>;
  issueClient(input: {
    client: FoundationClient;
    tokenDigest: string;
    idempotencyKey: string;
    requestDigest: string;
    identity: FoundationIdentity;
    correlationId: string;
  }): Promise<{ client: FoundationClient; created: boolean }>;
  listClients(
    input: FoundationScopedPage,
    identity: FoundationIdentity,
    environment: FoundationEnvironment,
    correlationId: string,
  ): Promise<{
    items: FoundationClient[];
    nextCursor: string | null;
    asOf: string;
  }>;
  revokeClient(
    clientId: string,
    identity: FoundationIdentity,
    environment: FoundationEnvironment,
    correlationId: string,
  ): Promise<FoundationClient>;
}

type Parser<T> = { parse(value: unknown): T };
type ScopedRecord = { id: string; projectId: string };
const supportedOperations = Object.freeze([
  "foundation.read",
  "evidence.record",
  "memory.propose",
  "memory.revise",
  "configuration.record",
] as const);

function requestDigest(
  operation: string,
  projectId: string,
  environment: FoundationEnvironment,
  input: unknown,
) {
  return foundationDigest({ operation, projectId, environment, input });
}

function requireOutputBinding<T extends object>(
  record: T,
  expected: Partial<T>,
): void {
  if (
    foundationDigest(record) !== foundationDigest({ ...record, ...expected })
  ) {
    throw new FoundationError(
      "INVALID_REFERENCE",
      "Foundation result does not match request",
    );
  }
}

async function mutate<T extends ScopedRecord>(
  records: FoundationRecordPort,
  context: FoundationOperationContext,
  input: unknown,
  key: string,
  schema: Parser<T>,
  bind: (record: T) => void,
  perform: () => Promise<T>,
): Promise<FoundationMutationResult<T>> {
  function bound(value: unknown): T {
    const record = scoped(schema, value, context.projectId);
    bind(record);
    return record;
  }
  const result = await records.idempotent(
    key,
    requestDigest(
      context.operation,
      context.projectId,
      context.environment,
      input,
    ),
    async () => ({
      record: bound(await perform()),
      correlationId: context.correlationId,
    }),
  );
  // Parse inside the authorized callback, including stored replay outputs.
  return {
    record: bound(result.value.record),
    replayed: result.replayed,
    correlationId: foundationActorSchema.shape.correlationId.parse(
      result.value.correlationId,
    ),
  };
}

export function createFoundationMachineService(
  port: FoundationAccessPort,
  options: FoundationServiceOptions,
) {
  const server = runtime(options);
  async function run<T>(
    token: string,
    operation: FoundationOperation,
    projectId: string,
    targetId: string | null,
    action: (
      records: FoundationRecordPort,
      actor: FoundationActor,
      context: FoundationOperationContext,
    ) => Promise<T>,
  ): Promise<T> {
    const tokenDigest = foundationTokenDigest(token);
    const context = {
      operation,
      projectId,
      environment: server.environment,
      correlationId: server.id(),
      targetId,
    };
    return port.withClient(
      { ...context, tokenDigest },
      async (stored, records) => {
        const client = foundationClientSchema.parse(stored);
        const authorize = () =>
          requireFoundationGrant(client, {
            operation,
            projectId,
            environment: server.environment,
            now: server.now(),
          });
        authorize();
        const actor = foundationActorSchema.parse({
          schemaVersion: 1,
          principalId: "foundation-client:" + client.id,
          clientId: client.id,
          runId: null,
          capabilities: client.operations,
          projectId,
          resourceIds: [],
          environment: server.environment,
          expiresAt: client.expiresAt,
          correlationId: context.correlationId,
        });
        const value = await action(records, actor, context);
        authorize();
        return value;
      },
    );
  }

  return {
    describe(token: string, project: unknown) {
      const projectId = foundationActorSchema.shape.projectId.parse(project);
      return run(
        token,
        "foundation.read",
        projectId,
        null,
        async (_, actor) => ({
          actor,
          supportedOperations: [...supportedOperations],
        }),
      );
    },
    getEvidence(token: string, raw: unknown) {
      const input = foundationReadRecordSchema.parse(raw);
      return run(
        token,
        "foundation.read",
        input.projectId,
        input.id,
        async (r) =>
          scoped(
            foundationEvidenceSchema,
            await r.getEvidence(input.id),
            input.projectId,
            input.id,
          ),
      );
    },
    getMemory(token: string, raw: unknown) {
      const input = foundationReadRecordSchema.parse(raw);
      return run(
        token,
        "foundation.read",
        input.projectId,
        input.id,
        async (r) => {
          const memory = scoped(
            foundationMemorySchema,
            await r.getMemory(input.id, false),
            input.projectId,
            input.id,
          );
          const anchor = anchorFor(
            await r.getMemoryAnchor(memory.id),
            memory.knowledgeItemId,
            memory.content.evidenceIds,
          );
          return { memory, anchor };
        },
      );
    },
    getConfiguration(token: string, raw: unknown) {
      const input = foundationReadRecordSchema.parse(raw);
      return run(
        token,
        "foundation.read",
        input.projectId,
        input.id,
        async (r) =>
          scoped(
            foundationConfigurationSchema,
            await r.getConfiguration(input.id),
            input.projectId,
            input.id,
          ),
      );
    },
    recordEvidence(token: string, raw: unknown, rawKey: unknown) {
      const input = foundationEvidenceInputSchema.parse(raw);
      const key = foundationIdempotencyKeySchema.parse(rawKey);
      return run(
        token,
        "evidence.record",
        input.projectId,
        null,
        (r, actor, context) =>
          mutate(
            r,
            context,
            input,
            key,
            foundationEvidenceSchema,
            (record) =>
              requireOutputBinding(record, {
                ...input,
                verification: "unverified",
                recordedBy: actor.principalId,
              }),
            async () => {
              await r.validateEvidenceReference(input);
              const record = foundationEvidenceSchema.parse({
                ...input,
                schemaVersion: 1,
                id: server.id(),
                ingestedAt: server.now().toISOString(),
                recordedBy: actor.principalId,
                verification: "unverified",
              });
              return exact(
                foundationEvidenceSchema,
                await r.insertEvidence(record),
                record,
              );
            },
          ),
      );
    },
    proposeMemory(token: string, raw: unknown, rawKey: unknown) {
      const input = foundationProposeMemorySchema.parse(raw);
      const key = foundationIdempotencyKeySchema.parse(rawKey);
      return run(
        token,
        "memory.propose",
        input.projectId,
        null,
        (r, actor, context) =>
          mutate(
            r,
            context,
            input,
            key,
            foundationMemorySchema,
            (record) =>
              requireOutputBinding(record, {
                knowledgeItemId: input.knowledgeItemId,
                content: input.content,
                contentDigest: foundationDigest(input.content),
                version: 1,
                lifecycle: "proposed",
                verification: "unverified",
                recordedBy: actor.principalId,
              }),
            () =>
              proposeFoundationMemory(r, input, {
                ...server,
                principalId: actor.principalId,
              }),
          ),
      );
    },
    reviseMemory(token: string, raw: unknown, rawKey: unknown) {
      const input = foundationReviseMemorySchema.parse(raw);
      const key = foundationIdempotencyKeySchema.parse(rawKey);
      return run(
        token,
        "memory.revise",
        input.projectId,
        input.memoryId,
        (r, actor, context) =>
          mutate(
            r,
            context,
            input,
            key,
            foundationMemorySchema,
            (record) =>
              requireOutputBinding(record, {
                id: input.memoryId,
                version: input.expectedVersion + 1,
                content: input.content,
                contentDigest: foundationDigest(input.content),
                lifecycle: "proposed",
                verification: "unverified",
                recordedBy: actor.principalId,
              }),
            () =>
              reviseFoundationMemory(r, input, {
                ...server,
                principalId: actor.principalId,
              }),
          ),
      );
    },
    recordConfiguration(token: string, raw: unknown, rawKey: unknown) {
      const input = foundationCreateConfigurationSchema.parse(raw);
      const key = foundationIdempotencyKeySchema.parse(rawKey);
      return run(
        token,
        "configuration.record",
        input.projectId,
        null,
        (r, actor, context) =>
          mutate(
            r,
            context,
            input,
            key,
            foundationConfigurationSchema,
            (record) =>
              requireOutputBinding(record, {
                ...input,
                contentDigest: createHash("sha256")
                  .update(input.content, "utf8")
                  .digest("hex"),
                recordedBy: actor.principalId,
              }),
            async () => {
              await r.assertReferences({
                evidenceIds: [],
                memoryIds: [],
                configurationIds: input.parentIds,
              });
              const record = foundationConfigurationSchema.parse({
                ...input,
                schemaVersion: 1,
                id: server.id(),
                contentDigest: createHash("sha256")
                  .update(input.content, "utf8")
                  .digest("hex"),
                recordedBy: actor.principalId,
                recordedAt: server.now().toISOString(),
              });
              return exact(
                foundationConfigurationSchema,
                await r.insertConfiguration(record),
                record,
              );
            },
          ),
      );
    },
  };
}

/**
 * Internal owner services only. Transport adapters must authenticate the owner;
 * no MCP issuer/reviewer tool or request-supplied owner flag is enabled here.
 * Follow-up: wire trusted human sessions and documented owner-only transports.
 */
export function createFoundationOwnerService(
  port: FoundationAccessPort,
  identity: FoundationIdentity,
  options: FoundationServiceOptions,
) {
  const server = runtime(options);
  const trusted = {
    principalId: identity.principalId,
    expiresAt: identity.expiresAt,
  };
  function session(): FoundationIdentity {
    if (
      !foundationActorSchema.shape.principalId.safeParse(trusted.principalId)
        .success ||
      !foundationActorSchema.shape.expiresAt.safeParse(trusted.expiresAt)
        .success ||
      foundationInstantMilliseconds(trusted.expiresAt) <= server.now().getTime()
    ) {
      throw new FoundationError(
        "FORBIDDEN",
        "A live owner session is required",
      );
    }
    return { ...trusted };
  }
  async function run<T>(
    operation: FoundationOperation,
    projectId: string,
    targetId: string,
    action: (
      records: FoundationRecordPort,
      actor: FoundationActor,
      context: FoundationOperationContext,
    ) => Promise<T>,
    completed?: () => void,
  ): Promise<T> {
    const owner = session();
    const context = {
      operation,
      projectId,
      environment: server.environment,
      correlationId: server.id(),
      targetId,
    };
    return port.withOwner({ ...context, ...owner }, async (records) => {
      session();
      const actor = foundationActorSchema.parse({
        schemaVersion: 1,
        principalId: owner.principalId,
        clientId: null,
        runId: null,
        capabilities: [...FOUNDATION_OPERATIONS],
        projectId,
        resourceIds: [],
        environment: server.environment,
        expiresAt: owner.expiresAt,
        correlationId: context.correlationId,
      });
      const value = await action(records, actor, context);
      session();
      completed?.();
      return value;
    });
  }
  return {
    /** Committed issuance replays never reveal the secret again. Recover by
     * listing/revoking the client and issuing with a new key. */
    async createClient(raw: unknown, rawKey: unknown) {
      const input = foundationCreateClientSchema.parse(raw);
      const key = foundationIdempotencyKeySchema.parse(rawKey);
      const owner = session();
      if (input.environment !== server.environment) {
        throw new FoundationError(
          "FORBIDDEN",
          "Foundation environment does not match",
        );
      }
      const createdAt = server.now();
      const client = foundationClientSchema.parse({
        schemaVersion: 1,
        id: server.id(),
        projectId: input.projectId,
        name: input.name,
        operations: input.operations,
        environment: server.environment,
        createdAt: createdAt.toISOString(),
        expiresAt: new Date(
          createdAt.getTime() + input.ttlSeconds * 1000,
        ).toISOString(),
        revokedAt: null,
        createdBy: owner.principalId,
      });
      const token = "af_" + randomBytes(32).toString("base64url");
      const issued = foundationIssuedClientSchema.parse({
        client,
        token,
        notice: "Credential shown once; store it outside Commandry knowledge.",
      });
      const result = await port.issueClient({
        client,
        tokenDigest: foundationTokenDigest(token),
        idempotencyKey: key,
        requestDigest: requestDigest(
          "foundation.client.create",
          input.projectId,
          server.environment,
          input,
        ),
        identity: owner,
        correlationId: server.id(),
      });
      session();
      if (!result.created) {
        throw new FoundationError(
          "IDEMPOTENCY_CONFLICT",
          "Credential issuance already committed; list or revoke it and use a new key",
        );
      }
      exact(foundationClientSchema, result.client, client);
      return issued;
    },
    async listClients(raw: unknown) {
      const input = foundationScopedPageSchema.parse(raw);
      const result = await port.listClients(
        input,
        session(),
        server.environment,
        server.id(),
      );
      session();
      const items = result.items.map((item) => {
        const client = scoped(foundationClientSchema, item, input.projectId);
        if (client.environment !== server.environment) notFound();
        return client;
      });
      return {
        items,
        nextCursor: foundationReadRecordSchema.shape.id
          .nullable()
          .parse(result.nextCursor),
        asOf: foundationActorSchema.shape.expiresAt.parse(result.asOf),
      };
    },
    async revokeClient(raw: unknown) {
      const input = foundationRevokeClientSchema.parse(raw);
      const result = await port.revokeClient(
        input.clientId,
        session(),
        server.environment,
        server.id(),
      );
      session();
      const client = foundationClientSchema.parse(result);
      if (
        client.id !== input.clientId ||
        client.environment !== server.environment
      )
        notFound();
      if (client.revokedAt === null)
        throw new FoundationError(
          "INVALID_REFERENCE",
          "Invalid foundation result",
        );
      return client;
    },
    async getMemory(raw: unknown) {
      const input = foundationReadRecordSchema.parse(
        (() => {
          try {
            return JSON.parse(canonicalFoundationJson(raw));
          } catch {
            return null;
          }
        })(),
      );
      let callbackCount = 0;
      let callbackCompleted = false;
      let expectedDigest: string | undefined;
      let selected: unknown;
      let storedInput: unknown;
      let anchorInput: unknown;
      let storedDigest: string | undefined;
      let anchorDigest: string | undefined;
      const value = await run(
        "memory.read",
        input.projectId,
        input.id,
        async (r) => {
          callbackCount++;
          if (callbackCount !== 1)
            throw new Error("Foundation memory output unavailable");
          let stored;
          try {
            stored = await r.getMemory(input.id, false);
          } catch {
            throw new Error("Foundation memory output unavailable");
          }
          if (stored === null) notFound();
          storedInput = stored;
          const parse = (rawValue: unknown) => {
            try {
              const result = foundationMemorySchema.parse(
                JSON.parse(canonicalFoundationJson(rawValue)),
              );
              if (
                foundationDigest(result) !== foundationDigest(rawValue) ||
                result.contentDigest !== foundationDigest(result.content)
              )
                throw new Error();
              return result;
            } catch {
              throw new Error("Foundation memory output unavailable");
            }
          };
          const memory = parse(stored);
          storedDigest = foundationDigest(storedInput);
          if (memory.projectId !== input.projectId || memory.id !== input.id)
            notFound();
          let rawAnchor;
          try {
            rawAnchor = await r.getMemoryAnchor(memory.id);
          } catch {
            throw new Error("Foundation memory output unavailable");
          }
          anchorInput = rawAnchor;
          try {
            const anchorSnapshot =
              foundationOwnerMemoryReadSchema.shape.anchor.parse(
                JSON.parse(canonicalFoundationJson(rawAnchor)),
              );
            if (
              foundationDigest(anchorSnapshot) !== foundationDigest(rawAnchor)
            )
              throw new Error();
            const anchor = anchorFor(
              anchorSnapshot,
              memory.knowledgeItemId,
              memory.content.evidenceIds,
            );
            const result = foundationOwnerMemoryReadSchema.parse({
              memory,
              anchor,
            });
            if (
              foundationDigest(result) !== foundationDigest({ memory, anchor })
            )
              throw new Error();
            selected = result;
            anchorDigest = foundationDigest(anchorInput);
            expectedDigest = foundationDigest(result);
            return result;
          } catch {
            throw new Error("Foundation memory output unavailable");
          }
        },
        () => {
          callbackCompleted = true;
        },
      );
      session();
      const delivered = (() => {
        try {
          if (
            callbackCount !== 1 ||
            !callbackCompleted ||
            expectedDigest === undefined ||
            foundationDigest(storedInput) !== storedDigest ||
            foundationDigest(anchorInput) !== anchorDigest ||
            foundationDigest(value) !== expectedDigest ||
            foundationDigest(selected) !== expectedDigest
          )
            throw new Error();
          const result = foundationOwnerMemoryReadSchema.parse(
            JSON.parse(canonicalFoundationJson(value)),
          );
          if (foundationDigest(result) !== expectedDigest) throw new Error();
          return result;
        } catch {
          throw new Error("Foundation memory output unavailable");
        }
      })();
      session();
      return delivered;
    },
    reviewMemory(raw: unknown, rawKey: unknown) {
      const input = foundationReviewMemorySchema.parse(raw);
      const key = foundationIdempotencyKeySchema.parse(rawKey);
      return run(
        "memory.review",
        input.projectId,
        input.memoryId,
        (r, actor, context) =>
          mutate(
            r,
            context,
            input,
            key,
            foundationMemorySchema,
            (record) =>
              requireOutputBinding(record, {
                id: input.memoryId,
                version: input.expectedVersion,
                lifecycle: input.decision,
              }),
            async () => {
              const current = scoped(
                foundationMemorySchema,
                await r.getMemory(input.memoryId, true),
                input.projectId,
                input.memoryId,
              );
              requireFoundationVersion(current.version, input.expectedVersion);
              return exact(
                foundationMemorySchema,
                await r.reviewMemory(input, actor, server.now().toISOString()),
                { ...current, lifecycle: input.decision },
              );
            },
          ),
      );
    },
    verifyMemory(raw: unknown, rawKey: unknown) {
      const input = foundationVerifyMemorySchema.parse(raw);
      const key = foundationIdempotencyKeySchema.parse(rawKey);
      return run(
        "memory.verify",
        input.projectId,
        input.memoryId,
        (r, actor, context) =>
          mutate(
            r,
            context,
            input,
            key,
            foundationMemorySchema,
            (record) =>
              requireOutputBinding(record, {
                id: input.memoryId,
                version: input.expectedVersion,
                verification: input.verification,
              }),
            async () => {
              const current = scoped(
                foundationMemorySchema,
                await r.getMemory(input.memoryId, true),
                input.projectId,
                input.memoryId,
              );
              requireFoundationVersion(current.version, input.expectedVersion);
              await r.assertReferences({
                evidenceIds: input.evidenceIds,
                memoryIds: [],
                configurationIds: [],
              });
              return exact(
                foundationMemorySchema,
                await r.verifyMemory(input, actor, server.now().toISOString()),
                { ...current, verification: input.verification },
              );
            },
          ),
      );
    },
    approveInstruction(raw: unknown, rawKey: unknown) {
      const input = foundationApproveInstructionSchema.parse(raw);
      const key = foundationIdempotencyKeySchema.parse(rawKey);
      return run(
        "instruction.approve",
        input.projectId,
        input.memoryId,
        async (r, actor, context) => {
          const result = await mutate(
            r,
            context,
            input,
            key,
            foundationInstructionApprovalSchema,
            (record) =>
              requireOutputBinding(record, {
                memoryId: input.memoryId,
                version: input.expectedVersion,
                contentDigest: input.contentDigest,
                disclosureProjectId: input.disclosureProjectId,
                expiresAt: input.expiresAt,
                approvedBy: actor.principalId,
                revokedAt: null,
              }),
            async () => {
              const current = scoped(
                foundationMemorySchema,
                await r.getMemory(input.memoryId, true),
                input.projectId,
                input.memoryId,
              );
              requireFoundationVersion(current.version, input.expectedVersion);
              if (
                current.content.category !== "instruction" ||
                foundationDigest(current.content) !== current.contentDigest
              ) {
                throw new FoundationError(
                  "APPROVAL_REQUIRED",
                  "Instruction requires an exact reviewed binding",
                );
              }
              const hasUnresolvedContradictions =
                await r.hasUnresolvedContradictions(current.id);
              const anchor = await r.getMemoryAnchor(current.id);
              const at = server.now();
              const review = {
                category: current.content.category,
                lifecycle: current.lifecycle,
                verification: current.verification,
                version: current.version,
                contentDigest: current.contentDigest,
                hasUnresolvedContradictions,
              };
              const approval = {
                version: input.expectedVersion,
                contentDigest: input.contentDigest,
                disclosureProjectId: input.disclosureProjectId,
                expiresAt: input.expiresAt,
              };
              const requireLiveApproval = (instant: Date) =>
                requireFoundationReview(
                  review,
                  approval,
                  input.projectId,
                  instant,
                );
              requireLiveApproval(at);
              anchorFor(
                anchor,
                current.knowledgeItemId,
                current.content.evidenceIds,
                true,
              );
              const record = foundationInstructionApprovalSchema.parse({
                schemaVersion: 1,
                id: server.id(),
                projectId: input.projectId,
                memoryId: current.id,
                version: current.version,
                contentDigest: current.contentDigest,
                disclosureProjectId: input.disclosureProjectId,
                approvedAt: at.toISOString(),
                expiresAt: input.expiresAt,
                approvedBy: actor.principalId,
                revokedAt: null,
              });
              // Only creation takes this path; historical receipts are validated
              // against their original request without claiming live eligibility.
              requireLiveApproval(server.now());
              const inserted = await r.insertInstructionApproval(record);
              requireLiveApproval(server.now());
              return exact(
                foundationInstructionApprovalSchema,
                inserted,
                record,
              );
            },
          );
          // Receipt persistence may await after perform finishes. New approvals
          // must still be live at this final authorized callback boundary.
          if (
            !result.replayed &&
            foundationInstantMilliseconds(result.record.expiresAt) <=
              server.now().getTime()
          ) {
            throw new FoundationError(
              "APPROVAL_REQUIRED",
              "Instruction requires a live approval expiry",
            );
          }
          return result;
        },
      );
    },
  };
}
