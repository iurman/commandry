import { createHash, randomUUID } from "node:crypto";
import {
  FOUNDATION_TASK_PROPOSAL_MAX_INPUT_BYTES,
  foundationActorSchema,
  foundationClientSchema,
  foundationIdempotencyKeySchema,
  foundationTaskProposalBindingSchema,
  foundationTaskProposalDecisionSchema,
  foundationTaskProposalDetailSchema,
  foundationTaskProposalInputSchema,
  foundationTaskProposalReviewInputSchema,
  foundationTaskProposalReviewReceiptSchema,
  foundationTaskProposalSubmissionSchema,
  type FoundationClient,
  type FoundationTaskProposalBinding,
  type FoundationTaskProposalDecision,
  type FoundationTaskProposalDetail,
  type FoundationTaskProposalReviewReceipt,
  type FoundationTaskProposalSubmission,
} from "@commandry/contracts";
import {
  FoundationError,
  canonicalFoundationJson,
  foundationDigest,
  foundationInstantMilliseconds,
  foundationTokenDigest,
  requireFoundationGrant,
} from "@commandry/domain";
import type {
  FoundationIdentity,
  FoundationMachineRequest,
  FoundationMutationResult,
  FoundationOwnerRequest,
  FoundationRecordPort,
  FoundationServiceOptions,
} from "./agent-foundation";

/** Methods share the enclosing grant/session, receipt and audit transaction.
 * Insert atomically preserves canonical Capture and suggestion. Review holds an
 * exclusive Capture lock and atomically persists one terminal decision plus its
 * canonical task, if approved. The adapter owns membership, serialization,
 * immutable historical receipts and rollback on output or audit failure. */
export interface FoundationTaskProposalRecords extends FoundationRecordPort {
  insertTaskProposal(
    detail: FoundationTaskProposalDetail,
  ): Promise<FoundationTaskProposalDetail>;
  getTaskProposal(
    proposalId: string,
    lock: boolean,
  ): Promise<FoundationTaskProposalDetail | null>;
  getTaskProposalByCapture(
    captureId: string,
  ): Promise<FoundationTaskProposalDetail | null>;
  reviewTaskProposal(input: {
    decision: FoundationTaskProposalDecision;
  }): Promise<FoundationTaskProposalReviewReceipt>;
}
/** Authenticate the canonical client or trusted human session and retain its
 * transaction/locks through receipts and audit. Roll back on callback failure,
 * recheck expiry after audit and before commit, and serialize terminal reviews.
 * Application delivery checks cannot undo an already committed transaction. */
export interface FoundationTaskProposalPort {
  withClient<T>(
    request: FoundationMachineRequest,
    callback: (
      client: FoundationClient,
      records: FoundationTaskProposalRecords,
    ) => Promise<T>,
  ): Promise<T>;
  withOwner<T>(
    request: FoundationOwnerRequest,
    callback: (records: FoundationTaskProposalRecords) => Promise<T>,
  ): Promise<T>;
}

type Parser<T> = { parse(raw: unknown): T };
type Stored<T> = { record: T; correlationId: string };
type Check = () => void;
const ids = foundationActorSchema.shape.projectId;
const dates = foundationActorSchema.shape.expiresAt;
const sourceDigest = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex");

/** An unavailable producer/output must not be reported as bad caller input. */
export class FoundationTaskProposalUnavailableError extends Error {
  constructor() {
    super("Task proposal output unavailable");
    this.name = "FoundationTaskProposalUnavailableError";
  }
}

function invalid(): never {
  throw new FoundationTaskProposalUnavailableError();
}
function invalidInput(): never {
  throw new FoundationError("INVALID_REFERENCE", "Invalid task proposal input");
}
function snapshot<T>(raw: T, onInvalid: () => never = invalid): T {
  try {
    // The canonical encoder inspects descriptors without invoking getters.
    return JSON.parse(canonicalFoundationJson(raw)) as T;
  } catch {
    onInvalid();
  }
}
function object(
  raw: unknown,
  keys: string[],
  onInvalid: () => never = invalid,
): Record<string, unknown> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw))
    onInvalid();
  const value = raw as Record<string, unknown>;
  if (
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    onInvalid();
  return value;
}
function equal(actual: unknown, expected: unknown): void {
  if (
    foundationDigest(snapshot(actual)) !== foundationDigest(snapshot(expected))
  )
    invalid();
}
function stored<T>(schema: Parser<T>, raw: unknown): T {
  try {
    const value = snapshot(raw);
    const parsed = schema.parse(value);
    equal(value, parsed);
    return parsed;
  } catch {
    invalid();
  }
}
function input<T>(schema: Parser<T>, raw: unknown): T {
  const parsed = schema.parse(snapshot(raw, invalidInput));
  if (
    Buffer.byteLength(canonicalFoundationJson(parsed), "utf8") >
    FOUNDATION_TASK_PROPOSAL_MAX_INPUT_BYTES
  )
    invalidInput();
  return parsed;
}
function requestDigest(
  request: FoundationMachineRequest | FoundationOwnerRequest,
  principalId: string,
  value: unknown,
): string {
  return foundationDigest({
    schemaVersion: 1,
    operation: request.operation,
    projectId: request.projectId,
    environment: request.environment,
    principalId,
    input: value,
  });
}

export function createFoundationTaskProposalService(
  port: FoundationTaskProposalPort,
  options: FoundationServiceOptions,
) {
  const configuredEnvironment =
    foundationActorSchema.shape.environment.safeParse(options.environment);
  if (!configuredEnvironment.success) invalid();
  const environment = configuredEnvironment.data;
  const clock = options.now ?? (() => new Date());
  const createId = options.createId ?? randomUUID;
  const id = () => {
    const result = ids.safeParse(createId());
    if (!result.success) invalid();
    return result.data;
  };
  function now(): Date {
    const value = clock();
    if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
      invalid();
    const instant = new Date(value.getTime());
    if (!dates.safeParse(instant.toISOString()).success) invalid();
    return instant;
  }
  async function checked<T>(promise: Promise<T>, authorize: Check): Promise<T> {
    const value = await promise;
    authorize();
    return value;
  }
  function detail(
    raw: unknown,
    projectId: string,
    selector: { proposalId?: string; captureId?: string } = {},
  ): FoundationTaskProposalDetail {
    const value = stored(foundationTaskProposalDetailSchema, raw);
    const binding = value.suggestion.proposal.binding;
    if (
      binding.projectId !== projectId ||
      binding.environment !== environment ||
      (selector.proposalId !== undefined &&
        binding.proposalId !== selector.proposalId) ||
      (selector.captureId !== undefined &&
        binding.captureId !== selector.captureId) ||
      sourceDigest(value.capture.originalContent) !== binding.sourceDigest ||
      foundationDigest(binding) !== value.suggestion.proposal.contentDigest
    )
      invalid();
    return value;
  }
  function lookupDetail(
    raw: unknown,
    projectId: string,
    selector: { proposalId?: string; captureId?: string },
  ): FoundationTaskProposalDetail {
    if (raw === null)
      throw new FoundationError("NOT_FOUND", "Task proposal not found");
    return detail(raw, projectId, selector);
  }
  async function mutation<T>(
    records: FoundationTaskProposalRecords,
    key: string,
    digest: string,
    authorize: Check,
    parse: (raw: unknown) => Stored<T>,
    perform: () => Promise<Stored<T>>,
  ): Promise<FoundationMutationResult<T>> {
    let calls = 0;
    let performedDigest: string | undefined;
    const raw = await checked(
      records.idempotent(key, digest, async () => {
        calls += 1;
        if (calls !== 1) invalid();
        authorize();
        const value = snapshot(await checked(perform(), authorize));
        performedDigest = foundationDigest(value);
        return value;
      }),
      authorize,
    );
    const envelope = object(snapshot(raw), ["value", "replayed"]);
    if (
      typeof envelope.replayed !== "boolean" ||
      calls > 1 ||
      (envelope.replayed ? calls !== 0 : calls !== 1)
    )
      invalid();
    const value = parse(envelope.value);
    if (!envelope.replayed && foundationDigest(value) !== performedDigest)
      invalid();
    return { ...value, replayed: envelope.replayed };
  }
  async function machine<T>(
    token: string,
    projectId: string,
    action: (
      records: FoundationTaskProposalRecords,
      request: FoundationMachineRequest,
      client: FoundationClient,
      authorize: Check,
    ) => Promise<T>,
  ): Promise<T> {
    const tokenDigest = foundationTokenDigest(token);
    now();
    const request: FoundationMachineRequest = {
      tokenDigest,
      operation: "work.propose",
      projectId,
      environment,
      targetId: null,
      correlationId: id(),
    };
    let callbacks = 0;
    let authorize: Check | undefined;
    let expectedDigest: string | undefined;
    const result = await port.withClient(
      { ...request },
      async (grant, records) => {
        callbacks += 1;
        if (callbacks !== 1) invalid();
        let clientId: string | undefined;
        let grantDigest: string | undefined;
        authorize = () => {
          const raw = snapshot(grant);
          const parsed = foundationClientSchema.safeParse(raw);
          if (!parsed.success)
            throw new FoundationError("FORBIDDEN", "Invalid foundation grant");
          const client = parsed.data;
          if (clientId !== undefined && client.id !== clientId) invalid();
          requireFoundationGrant(client, {
            operation: "work.propose",
            projectId,
            environment,
            now: now(),
          });
          const digest = foundationDigest(raw);
          if (grantDigest !== undefined && digest !== grantDigest) invalid();
          grantDigest = digest;
          clientId = client.id;
        };
        authorize();
        const client = foundationClientSchema.parse(snapshot(grant));
        const value = snapshot(
          await checked(action(records, request, client, authorize), authorize),
        );
        expectedDigest = foundationDigest(value);
        return value;
      },
    );
    if (
      callbacks !== 1 ||
      authorize === undefined ||
      expectedDigest === undefined
    )
      invalid();
    authorize();
    const value = snapshot(result);
    if (foundationDigest(value) !== expectedDigest) invalid();
    return value;
  }
  async function owner<T>(
    trusted: FoundationIdentity,
    projectId: string,
    operation: "work.proposal.read" | "work.proposal.review",
    targetId: string,
    action: (
      records: FoundationTaskProposalRecords,
      request: FoundationOwnerRequest,
      authorize: Check,
    ) => Promise<T>,
  ): Promise<T> {
    const identity = object(snapshot(trusted), ["principalId", "expiresAt"]);
    const human = foundationTaskProposalDecisionSchema.shape.actor.safeParse(
      identity.principalId,
    );
    const expiry = dates.safeParse(identity.expiresAt);
    if (!human.success || !expiry.success)
      throw new FoundationError(
        "FORBIDDEN",
        "A trusted human session is required",
      );
    const identityDigest = foundationDigest(identity);
    const authorize = () => {
      if (foundationInstantMilliseconds(expiry.data) <= now().getTime())
        throw new FoundationError(
          "EXPIRED",
          "A live owner session is required",
        );
      if (foundationDigest(snapshot(trusted)) !== identityDigest) invalid();
    };
    authorize();
    const request: FoundationOwnerRequest = {
      principalId: human.data,
      expiresAt: expiry.data,
      projectId,
      operation,
      targetId,
      environment,
      correlationId: id(),
    };
    let callbacks = 0;
    let expectedDigest: string | undefined;
    const result = await port.withOwner({ ...request }, async (records) => {
      callbacks += 1;
      if (callbacks !== 1) invalid();
      authorize();
      const value = snapshot(
        await checked(action(records, request, authorize), authorize),
      );
      expectedDigest = foundationDigest(value);
      return value;
    });
    authorize();
    if (callbacks !== 1 || expectedDigest === undefined) invalid();
    const value = snapshot(result);
    if (foundationDigest(value) !== expectedDigest) invalid();
    return value;
  }
  function envelope<T>(schema: Parser<T>, raw: unknown): Stored<T> {
    const value = object(snapshot(raw), ["record", "correlationId"]);
    return {
      record: stored(schema, value.record),
      correlationId: stored(ids, value.correlationId),
    };
  }

  return {
    async submitTaskProposal(
      token: string,
      key: unknown,
      raw: unknown,
    ): Promise<FoundationMutationResult<FoundationTaskProposalSubmission>> {
      const value = input(foundationTaskProposalInputSchema, raw);
      const receiptKey = foundationIdempotencyKeySchema.parse(key);
      return machine(
        token,
        value.projectId,
        async (records, request, client, authorize) => {
          const principalId = "foundation-client:" + client.id;
          const source = sourceDigest(value.originalContent);
          const bind = (
            receipt: Pick<
              FoundationTaskProposalSubmission,
              "proposalId" | "captureId" | "submittedAt" | "correlationId"
            >,
          ): FoundationTaskProposalBinding =>
            stored(foundationTaskProposalBindingSchema, {
              schemaVersion: 1,
              proposalId: receipt.proposalId,
              captureId: receipt.captureId,
              projectId: value.projectId,
              environment,
              clientId: client.id,
              principalId,
              correlationId: receipt.correlationId,
              submittedAt: receipt.submittedAt,
              sourceDigest: source,
              proposalVersion: 1,
              proposedTitle: value.proposedTitle,
              proposedBody: value.proposedBody,
              rationale: value.rationale,
              runtime: null,
              model: null,
              runId: null,
            });
          const parse = (
            raw: unknown,
          ): Stored<FoundationTaskProposalSubmission> => {
            const result = envelope(
              foundationTaskProposalSubmissionSchema,
              raw,
            );
            const receipt = result.record;
            if (
              receipt.projectId !== value.projectId ||
              receipt.environment !== environment ||
              receipt.clientId !== client.id ||
              receipt.principalId !== principalId ||
              receipt.sourceDigest !== source ||
              result.correlationId !== receipt.correlationId ||
              foundationDigest(bind(receipt)) !== receipt.proposalDigest
            )
              invalid();
            return result;
          };
          return mutation(
            records,
            receiptKey,
            requestDigest(request, principalId, value),
            authorize,
            parse,
            async () => {
              const submittedAt = now().toISOString();
              const binding = bind({
                proposalId: id(),
                captureId: id(),
                submittedAt,
                correlationId: request.correlationId,
              });
              const proposalDigest = foundationDigest(binding);
              const created = stored(foundationTaskProposalDetailSchema, {
                capture: {
                  id: binding.captureId,
                  inputType: "text",
                  originalContent: value.originalContent,
                  file: null,
                  source: "foundation-client",
                  author: principalId,
                  state: "unfiled",
                  projectId: value.projectId,
                  filedRecord: null,
                  createdAt: submittedAt,
                  filedAt: null,
                },
                suggestion: {
                  id: binding.proposalId,
                  captureId: binding.captureId,
                  kind: "task",
                  proposedProjectId: value.projectId,
                  title: value.proposedTitle,
                  body: value.proposedBody,
                  confidence: null,
                  rationale: value.rationale,
                  ruleVersion: "agent-task-proposal/v1",
                  sourceLabel: "Agent task proposal",
                  createdAt: submittedAt,
                  proposal: { binding, contentDigest: proposalDigest },
                },
                decision: null,
              });
              const expected = foundationDigest(created);
              const inserted = detail(
                await checked(
                  records.insertTaskProposal(snapshot(created)),
                  authorize,
                ),
                value.projectId,
                { proposalId: binding.proposalId },
              );
              if (foundationDigest(inserted) !== expected) invalid();
              const record = stored(foundationTaskProposalSubmissionSchema, {
                schemaVersion: 1,
                proposalId: binding.proposalId,
                captureId: binding.captureId,
                projectId: value.projectId,
                environment,
                clientId: client.id,
                principalId,
                proposalVersion: 1,
                proposalDigest,
                sourceDigest: source,
                submittedAt,
                correlationId: request.correlationId,
                status: "pending",
                verification: "unverified",
              });
              return { record, correlationId: request.correlationId };
            },
          );
        },
      );
    },
    async reviewTaskProposal(
      trusted: FoundationIdentity,
      key: unknown,
      raw: unknown,
    ): Promise<FoundationMutationResult<FoundationTaskProposalReviewReceipt>> {
      const value = input(foundationTaskProposalReviewInputSchema, raw);
      const receiptKey = foundationIdempotencyKeySchema.parse(key);
      return owner(
        trusted,
        value.projectId,
        "work.proposal.review",
        value.proposalId,
        async (records, request, authorize) => {
          const parse = (
            raw: unknown,
          ): Stored<FoundationTaskProposalReviewReceipt> => {
            const result = envelope(
              foundationTaskProposalReviewReceiptSchema,
              raw,
            );
            const receipt = result.record;
            const decision = receipt.decision;
            if (
              receipt.projectId !== value.projectId ||
              receipt.proposalId !== value.proposalId ||
              receipt.environment !== environment ||
              decision.actor !== request.principalId ||
              decision.decision !== value.decision ||
              decision.provenance.proposalVersion !== value.expectedVersion ||
              decision.provenance.proposalDigest !==
                value.expectedProposalDigest ||
              decision.provenance.sourceDigest !== value.expectedSourceDigest ||
              result.correlationId !== decision.provenance.correlationId ||
              (value.decision === "approve" &&
                (decision.selectedTitle !== value.selectedTitle ||
                  decision.selectedBody !== value.selectedBody))
            )
              invalid();
            return result;
          };
          return mutation(
            records,
            receiptKey,
            requestDigest(request, request.principalId, value),
            authorize,
            parse,
            async () => {
              const current = lookupDetail(
                await checked(
                  records.getTaskProposal(value.proposalId, true),
                  authorize,
                ),
                value.projectId,
                { proposalId: value.proposalId },
              );
              const binding = current.suggestion.proposal.binding;
              if (
                current.decision !== null ||
                current.capture.state !== "unfiled" ||
                binding.proposalVersion !== value.expectedVersion ||
                binding.sourceDigest !== value.expectedSourceDigest ||
                current.suggestion.proposal.contentDigest !==
                  value.expectedProposalDigest
              )
                throw new FoundationError(
                  "VERSION_CONFLICT",
                  "Task proposal review is stale or terminal",
                );
              const decision = stored(foundationTaskProposalDecisionSchema, {
                id: id(),
                captureId: binding.captureId,
                suggestionId: binding.proposalId,
                decision: value.decision,
                selectedProjectId:
                  value.decision === "approve" ? value.projectId : null,
                selectedKind: value.decision === "approve" ? "task" : null,
                selectedTitle:
                  value.decision === "approve" ? value.selectedTitle : null,
                selectedBody:
                  value.decision === "approve" ? value.selectedBody : null,
                filedRecordId: value.decision === "approve" ? id() : null,
                actor: request.principalId,
                createdAt: now().toISOString(),
                provenance: {
                  schemaVersion: 1,
                  projectId: value.projectId,
                  environment,
                  proposalVersion: 1,
                  proposalDigest: value.expectedProposalDigest,
                  sourceDigest: value.expectedSourceDigest,
                  reviewedBy: request.principalId,
                  correlationId: request.correlationId,
                },
              });
              const expected = foundationDigest(decision);
              const record = stored(
                foundationTaskProposalReviewReceiptSchema,
                await checked(
                  records.reviewTaskProposal({ decision: snapshot(decision) }),
                  authorize,
                ),
              );
              if (
                foundationDigest(record.decision) !== expected ||
                record.captureId !== binding.captureId ||
                record.proposalId !== binding.proposalId ||
                record.projectId !== value.projectId ||
                record.environment !== environment
              )
                invalid();
              return { record, correlationId: request.correlationId };
            },
          );
        },
      );
    },
    async getTaskProposal(
      trusted: FoundationIdentity,
      raw: unknown,
    ): Promise<FoundationTaskProposalDetail> {
      const value = object(
        snapshot(raw, invalidInput),
        ["projectId", "captureId"],
        invalidInput,
      );
      const projectId = ids.parse(value.projectId);
      const captureId = ids.parse(value.captureId);
      return owner(
        trusted,
        projectId,
        "work.proposal.read",
        captureId,
        async (records, _request, authorize) =>
          lookupDetail(
            await checked(
              records.getTaskProposalByCapture(captureId),
              authorize,
            ),
            projectId,
            { captureId },
          ),
      );
    },
  };
}
