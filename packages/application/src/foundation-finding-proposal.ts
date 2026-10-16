import { createHash } from "node:crypto";
import {
  FOUNDATION_FINDING_PROPOSAL_MAX_INPUT_BYTES,
  foundationEvidenceSchema,
  foundationFindingProposalBindingSchema,
  foundationFindingProposalDecisionSchema,
  foundationFindingProposalDetailSchema,
  foundationFindingProposalInputSchema,
  foundationFindingProposalReviewInputSchema,
  foundationFindingProposalReviewReceiptSchema,
  foundationFindingProposalSubmissionSchema,
  foundationIdempotencyKeySchema,
  foundationReadRecordSchema,
  type FoundationEvidence,
  type FoundationFindingCitation,
  type FoundationFindingProposalDecision,
  type FoundationFindingProposalDetail,
  type FoundationFindingProposalInput,
  type FoundationFindingProposalReviewInput,
  type FoundationFindingProposalReviewReceipt,
  type FoundationFindingProposalSubmission,
} from "@commandry/contracts";
import {
  FoundationError,
  canonicalFoundationJson,
  foundationDigest,
} from "@commandry/domain";
import type {
  FoundationIdentity,
  FoundationMutationResult,
  FoundationRecordPort,
  FoundationServiceOptions,
} from "./agent-foundation";
import {
  createFoundationWorkflowAccess,
  FoundationWorkflowUnavailableError,
  foundationWorkflowInput,
  foundationWorkflowOutput,
  foundationWorkflowSnapshot,
  type FoundationWorkflowContext,
  type FoundationWorkflowPort,
} from "./foundation-workflow-access";

/** Adapters perform the Capture, Knowledge, evidence, memory and audit writes in
 * the same guarded transaction. These interfaces do not prove atomic storage. */
export interface FoundationFindingProposalRecords extends FoundationRecordPort {
  insertFindingProposal(
    detail: FoundationFindingProposalDetail,
  ): Promise<FoundationFindingProposalDetail>;
  getFindingProposal(
    proposalId: string,
    lock: boolean,
  ): Promise<FoundationFindingProposalDetail | null>;
  getFindingProposalByCapture(
    captureId: string,
  ): Promise<FoundationFindingProposalDetail | null>;
  reviewFindingProposal(input: {
    decision: FoundationFindingProposalDecision;
    memoryId: string;
    anchorEvidenceId: string;
  }): Promise<FoundationFindingProposalReviewReceipt>;
}
export type FoundationFindingProposalPort =
  FoundationWorkflowPort<FoundationFindingProposalRecords>;

type Context = FoundationWorkflowContext<FoundationFindingProposalRecords>;
type Parser<T> = { parse(value: unknown): T };
type Proof = {
  detail: FoundationFindingProposalDetail;
  memoryId: string | null;
  anchorEvidenceId: string | null;
  anchorEvidence: FoundationEvidence | null;
};
type Stored<T> = {
  schemaVersion: 1;
  operation: Context["request"]["operation"];
  projectId: string;
  environment: Context["request"]["environment"];
  principalId: string;
  requestDigest: string;
  correlationId: string;
  record: T;
  proof: Proof;
};

function unavailable(): never {
  throw new FoundationWorkflowUnavailableError();
}
function invalid(): never {
  throw new FoundationError("INVALID_REFERENCE", "Invalid finding reference");
}
function missing(): never {
  throw new FoundationError("NOT_FOUND", "Finding proposal not found");
}
function exact(actual: unknown, expected: unknown): void {
  if (foundationDigest(actual) !== foundationDigest(expected)) unavailable();
}
function keys(value: unknown, names: string[]): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== names.length ||
    Object.keys(value)
      .sort()
      .some((key, index) => key !== [...names].sort()[index])
  )
    unavailable();
  return value as Record<string, unknown>;
}
function immutable<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
}
function byteDigest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
function input<T>(schema: Parser<T>, raw: unknown): T {
  const copy = foundationWorkflowSnapshot(raw, invalid);
  if (
    Buffer.byteLength(canonicalFoundationJson(copy), "utf8") >
    FOUNDATION_FINDING_PROPOSAL_MAX_INPUT_BYTES
  )
    invalid();
  return immutable(foundationWorkflowInput(schema, copy));
}
function detail(
  raw: unknown,
  context: Context,
  wanted: { id?: string; captureId?: string },
): FoundationFindingProposalDetail {
  if (raw === null) missing();
  const result = foundationWorkflowOutput(
    foundationFindingProposalDetailSchema,
    raw,
  );
  const binding = result.suggestion.proposal.binding;
  if (
    binding.projectId !== context.request.projectId ||
    binding.environment !== context.request.environment ||
    (wanted.id !== undefined && binding.proposalId !== wanted.id) ||
    (wanted.captureId !== undefined && binding.captureId !== wanted.captureId)
  )
    missing();
  if (
    binding.sourceDigest !== byteDigest(result.capture.originalContent) ||
    binding.citationsDigest !== foundationDigest(binding.citations) ||
    result.suggestion.proposal.contentDigest !== foundationDigest(binding)
  )
    unavailable();
  return immutable(result);
}
async function citations(
  context: Context,
  values: readonly FoundationFindingCitation[],
): Promise<void> {
  const { records, guard, request } = context;
  await records.assertReferences({
    evidenceIds: values.map((value) => value.evidenceId),
    memoryIds: [],
    configurationIds: [],
  });
  guard();
  for (const value of values) {
    const raw = await records.getEvidence(value.evidenceId);
    guard();
    if (raw === null) invalid();
    const evidence = foundationWorkflowOutput(foundationEvidenceSchema, raw);
    if (
      evidence.id !== value.evidenceId ||
      evidence.projectId !== request.projectId ||
      evidence.sourceKind !== value.sourceKind ||
      evidence.sourceId !== value.sourceId ||
      evidence.sourceVersion !== value.sourceVersion ||
      evidence.contentDigest !== value.contentDigest ||
      evidence.availability !== "available"
    )
      invalid();
    const {
      schemaVersion: _schemaVersion,
      id: _id,
      ingestedAt: _ingestedAt,
      recordedBy: _recordedBy,
      verification: _verification,
      ...reference
    } = evidence;
    await records.validateEvidenceReference(reference);
    guard();
  }
}
function submissionBinding(
  record: FoundationFindingProposalSubmission,
  value: FoundationFindingProposalInput,
) {
  const {
    status: _status,
    verification: _verification,
    proposalDigest: _proposalDigest,
    ...identity
  } = record;
  return foundationFindingProposalBindingSchema.parse({
    ...identity,
    proposedTitle: value.proposedTitle,
    proposedBody: value.proposedBody,
    rationale: value.rationale,
    citations: value.citations,
    runtime: null,
    model: null,
    runId: null,
  });
}
function reviewMatches(
  value: FoundationFindingProposalReviewInput,
  source: FoundationFindingProposalDetail,
): void {
  const binding = source.suggestion.proposal.binding;
  if (
    source.decision !== null ||
    source.capture.state !== "unfiled" ||
    binding.proposalVersion !== value.expectedVersion ||
    binding.sourceDigest !== value.expectedSourceDigest ||
    binding.citationsDigest !== value.expectedCitationsDigest ||
    source.suggestion.proposal.contentDigest !== value.expectedProposalDigest
  )
    throw new FoundationError("VERSION_CONFLICT", "Finding review is stale");
}
function reviewReceipt(
  context: Context,
  value: FoundationFindingProposalReviewInput,
  proof: Proof,
  decision: FoundationFindingProposalDecision,
): FoundationFindingProposalReviewReceipt {
  const binding = proof.detail.suggestion.proposal.binding;
  const approved = value.decision === "approve";
  exact(decision, {
    ...decision,
    captureId: binding.captureId,
    suggestionId: binding.proposalId,
    decision: value.decision,
    selectedProjectId: approved ? value.projectId : null,
    selectedKind: approved ? "note" : null,
    selectedTitle: approved ? value.selectedTitle : null,
    selectedBody: approved ? value.selectedBody : null,
    filedRecordId: approved ? decision.filedRecordId : null,
    actor: context.actor.principalId,
    provenance: {
      schemaVersion: 1,
      projectId: value.projectId,
      environment: context.request.environment,
      proposalVersion: value.expectedVersion,
      proposalDigest: value.expectedProposalDigest,
      sourceDigest: value.expectedSourceDigest,
      citationsDigest: value.expectedCitationsDigest,
      reviewedBy: context.actor.principalId,
      correlationId: decision.provenance.correlationId,
      reason: value.reason,
    },
  });
  let knowledge = null;
  let memory = null;
  if (approved) {
    if (
      proof.memoryId === null ||
      proof.anchorEvidenceId === null ||
      proof.anchorEvidence === null
    )
      unavailable();
    const anchor = proof.anchorEvidence;
    if (
      anchor.id !== proof.anchorEvidenceId ||
      anchor.projectId !== value.projectId ||
      anchor.sourceKind !== "knowledge_revision" ||
      anchor.sourceId !== decision.filedRecordId ||
      anchor.sourceVersion !== "1" ||
      anchor.contentDigest !== byteDigest(value.selectedBody) ||
      anchor.availability !== "available" ||
      anchor.verification !== "unverified" ||
      anchor.recordedBy !== context.actor.principalId ||
      anchor.ingestedAt !== decision.createdAt ||
      binding.citations.some((entry) => entry.evidenceId === anchor.id)
    )
      unavailable();
    knowledge = {
      id: decision.filedRecordId,
      projectId: value.projectId,
      sourceCaptureId: binding.captureId,
      kind: "note" as const,
      title: value.selectedTitle,
      content: value.selectedBody,
      version: 1 as const,
      createdAt: decision.createdAt,
      updatedAt: decision.createdAt,
    };
    const content = {
      statement: value.selectedBody,
      category: "finding" as const,
      evidenceIds: [
        proof.anchorEvidenceId,
        ...binding.citations.map((entry) => entry.evidenceId),
      ],
      relatedMemoryIds: [],
      relationType: null,
    };
    memory = {
      schemaVersion: 1 as const,
      id: proof.memoryId,
      projectId: value.projectId,
      knowledgeItemId: decision.filedRecordId,
      version: 1,
      contentDigest: foundationDigest(content),
      content,
      lifecycle: "proposed" as const,
      verification: "unverified" as const,
      recordedBy: context.actor.principalId,
      recordedAt: decision.createdAt,
    };
  } else if (
    proof.memoryId !== null ||
    proof.anchorEvidenceId !== null ||
    proof.anchorEvidence !== null
  )
    unavailable();
  return foundationWorkflowOutput(
    foundationFindingProposalReviewReceiptSchema,
    {
      schemaVersion: 1,
      proposalId: value.proposalId,
      captureId: binding.captureId,
      projectId: value.projectId,
      environment: context.request.environment,
      decision,
      knowledge,
      memory,
    },
  );
}

export function createFoundationFindingProposalService(
  port: FoundationFindingProposalPort,
  options: FoundationServiceOptions,
) {
  const access = createFoundationWorkflowAccess(port, options);
  async function mutate<T>(
    context: Context,
    key: string,
    value: unknown,
    schema: Parser<T>,
    bind: (record: T, proof: Proof, correlationId: string) => void,
    perform: () => Promise<{ record: T; proof: Proof }>,
  ): Promise<FoundationMutationResult<T>> {
    const requestDigest = foundationDigest({
      schemaVersion: 1,
      operation: context.request.operation,
      projectId: context.request.projectId,
      environment: context.request.environment,
      principalId: context.actor.principalId,
      input: value,
    });
    const parse = (raw: unknown): Stored<T> => {
      const envelope = keys(foundationWorkflowSnapshot(raw), [
        "schemaVersion",
        "operation",
        "projectId",
        "environment",
        "principalId",
        "requestDigest",
        "correlationId",
        "record",
        "proof",
      ]);
      const correlationId = foundationReadRecordSchema.shape.id.parse(
        envelope.correlationId,
      );
      const evidence = keys(envelope.proof, [
        "detail",
        "memoryId",
        "anchorEvidenceId",
        "anchorEvidence",
      ]);
      const proof: Proof = {
        detail: detail(evidence.detail, context, {}),
        memoryId: foundationReadRecordSchema.shape.id
          .nullable()
          .parse(evidence.memoryId),
        anchorEvidenceId: foundationReadRecordSchema.shape.id
          .nullable()
          .parse(evidence.anchorEvidenceId),
        anchorEvidence:
          evidence.anchorEvidence === null
            ? null
            : foundationWorkflowOutput(
                foundationEvidenceSchema,
                evidence.anchorEvidence,
              ),
      };
      const record = foundationWorkflowOutput(schema, envelope.record);
      const stored: Stored<T> = {
        schemaVersion: 1,
        operation: context.request.operation,
        projectId: context.request.projectId,
        environment: context.request.environment,
        principalId: context.actor.principalId,
        requestDigest,
        correlationId,
        record,
        proof,
      };
      exact(envelope, stored);
      bind(record, proof, correlationId);
      return immutable(stored);
    };
    let calls = 0;
    let open = true;
    let finished = false;
    let produced: string | undefined;
    let raw;
    try {
      raw = await context.records.idempotent(key, requestDigest, async () => {
        context.guard();
        if (!open || ++calls !== 1) unavailable();
        const result = await perform();
        context.guard();
        if (!open) unavailable();
        const stored = parse({
          schemaVersion: 1,
          operation: context.request.operation,
          projectId: context.request.projectId,
          environment: context.request.environment,
          principalId: context.actor.principalId,
          requestDigest,
          correlationId: context.request.correlationId,
          ...result,
        });
        produced = foundationDigest(stored);
        finished = true;
        return stored;
      });
    } finally {
      open = false;
    }
    context.guard();
    const result = keys(foundationWorkflowSnapshot(raw), ["value", "replayed"]);
    if (
      typeof result.replayed !== "boolean" ||
      (result.replayed ? calls !== 0 : calls !== 1 || !finished)
    )
      unavailable();
    const stored = parse(result.value);
    if (!result.replayed && foundationDigest(stored) !== produced)
      unavailable();
    return immutable({
      record: stored.record,
      replayed: result.replayed,
      correlationId: stored.correlationId,
    });
  }
  const read = async (
    context: Context,
    wanted: { id?: string; captureId?: string },
  ) => {
    const raw =
      wanted.captureId !== undefined
        ? await context.records.getFindingProposalByCapture(wanted.captureId)
        : await context.records.getFindingProposal(wanted.id!, false);
    context.guard();
    return detail(raw, context, wanted);
  };
  return {
    async submitFindingProposal(token: string, rawKey: unknown, raw: unknown) {
      const value = input(foundationFindingProposalInputSchema, raw);
      const key = input(foundationIdempotencyKeySchema, rawKey);
      return immutable(
        await access.machine(
          token,
          "finding.propose",
          value.projectId,
          null,
          (context) =>
            mutate(
              context,
              key,
              value,
              foundationFindingProposalSubmissionSchema,
              (record, proof, correlationId) => {
                const binding = submissionBinding(record, value);
                exact(binding, proof.detail.suggestion.proposal.binding);
                exact(record, {
                  ...record,
                  projectId: value.projectId,
                  environment: context.request.environment,
                  clientId: context.actor.clientId,
                  principalId: context.actor.principalId,
                  correlationId,
                  sourceDigest: byteDigest(value.originalContent),
                  citationsDigest: foundationDigest(value.citations),
                  proposalDigest: foundationDigest(binding),
                });
                if (
                  proof.detail.capture.originalContent !==
                    value.originalContent ||
                  proof.detail.capture.state !== "unfiled" ||
                  proof.detail.decision !== null ||
                  proof.memoryId !== null ||
                  proof.anchorEvidenceId !== null ||
                  proof.anchorEvidence !== null
                )
                  unavailable();
              },
              async () => {
                await citations(context, value.citations);
                context.guard();
                const submittedAt = access.now().toISOString();
                const binding = foundationFindingProposalBindingSchema.parse({
                  schemaVersion: 1,
                  proposalId: access.createId(),
                  captureId: access.createId(),
                  projectId: value.projectId,
                  environment: context.request.environment,
                  clientId: context.actor.clientId,
                  principalId: context.actor.principalId,
                  correlationId: context.request.correlationId,
                  submittedAt,
                  sourceDigest: byteDigest(value.originalContent),
                  proposalVersion: 1,
                  proposedTitle: value.proposedTitle,
                  proposedBody: value.proposedBody,
                  rationale: value.rationale,
                  citations: value.citations,
                  citationsDigest: foundationDigest(value.citations),
                  runtime: null,
                  model: null,
                  runId: null,
                });
                const constructed = immutable(
                  foundationFindingProposalDetailSchema.parse({
                    capture: {
                      id: binding.captureId,
                      inputType: "text",
                      file: null,
                      originalContent: value.originalContent,
                      source: "foundation-client",
                      author: context.actor.principalId,
                      state: "unfiled",
                      projectId: value.projectId,
                      filedRecord: null,
                      createdAt: submittedAt,
                      filedAt: null,
                    },
                    suggestion: {
                      id: binding.proposalId,
                      captureId: binding.captureId,
                      kind: "note",
                      proposedProjectId: value.projectId,
                      title: value.proposedTitle,
                      body: value.proposedBody,
                      confidence: null,
                      rationale: value.rationale,
                      ruleVersion: "agent-finding-proposal/v1",
                      sourceLabel: "Agent finding proposal",
                      createdAt: submittedAt,
                      proposal: {
                        binding,
                        contentDigest: foundationDigest(binding),
                      },
                    },
                    decision: null,
                  }),
                );
                const inserted =
                  await context.records.insertFindingProposal(constructed);
                context.guard();
                const saved = detail(inserted, context, {
                  id: binding.proposalId,
                });
                exact(saved, constructed);
                const {
                  proposedTitle: _title,
                  proposedBody: _body,
                  rationale: _rationale,
                  citations: _citations,
                  runtime: _runtime,
                  model: _model,
                  runId: _run,
                  ...identity
                } = binding;
                const record = foundationFindingProposalSubmissionSchema.parse({
                  ...identity,
                  proposalDigest: foundationDigest(binding),
                  status: "pending",
                  verification: "unverified",
                });
                return {
                  record,
                  proof: {
                    detail: saved,
                    memoryId: null,
                    anchorEvidenceId: null,
                    anchorEvidence: null,
                  },
                };
              },
            ),
        ),
      );
    },
    async getFindingProposal(token: string, raw: unknown) {
      const value = input(foundationReadRecordSchema, raw);
      return immutable(
        await access.machine(
          token,
          "finding.read",
          value.projectId,
          value.id,
          (context) => read(context, { id: value.id }),
        ),
      );
    },
    async getFindingProposalByCaptureOwner(
      identity: FoundationIdentity,
      raw: unknown,
    ) {
      const byCapture = {
        parse(rawValue: unknown) {
          const copy = keys(rawValue, ["projectId", "captureId"]);
          const parsed = foundationReadRecordSchema.parse({
            projectId: copy.projectId,
            id: copy.captureId,
          });
          return { projectId: parsed.projectId, captureId: parsed.id };
        },
      };
      const value = input(byCapture, raw);
      return immutable(
        await access.owner(
          identity,
          "finding.read",
          value.projectId,
          value.captureId,
          (context) => read(context, { captureId: value.captureId }),
        ),
      );
    },
    async getFindingProposalOwner(identity: FoundationIdentity, raw: unknown) {
      const value = input(foundationReadRecordSchema, raw);
      return immutable(
        await access.owner(
          identity,
          "finding.read",
          value.projectId,
          value.id,
          (context) => read(context, { id: value.id }),
        ),
      );
    },
    async reviewFindingProposal(
      identity: FoundationIdentity,
      rawKey: unknown,
      raw: unknown,
    ) {
      const value = input(foundationFindingProposalReviewInputSchema, raw);
      const key = input(foundationIdempotencyKeySchema, rawKey);
      return immutable(
        await access.owner(
          identity,
          "finding.review",
          value.projectId,
          value.proposalId,
          (context) =>
            mutate(
              context,
              key,
              value,
              foundationFindingProposalReviewReceiptSchema,
              (record, proof, correlationId) => {
                if (proof.detail.suggestion.id !== value.proposalId)
                  unavailable();
                reviewMatches(value, proof.detail);
                if (record.decision.provenance.correlationId !== correlationId)
                  unavailable();
                exact(
                  record,
                  reviewReceipt(context, value, proof, record.decision),
                );
              },
              async () => {
                const rawDetail = await context.records.getFindingProposal(
                  value.proposalId,
                  true,
                );
                context.guard();
                const current = detail(rawDetail, context, {
                  id: value.proposalId,
                });
                reviewMatches(value, current);
                const approved = value.decision === "approve";
                if (approved) {
                  await citations(
                    context,
                    current.suggestion.proposal.binding.citations,
                  );
                  context.guard();
                }
                const memoryId = access.createId();
                const anchorEvidenceId = access.createId();
                const decision = immutable(
                  foundationFindingProposalDecisionSchema.parse({
                    id: access.createId(),
                    captureId: current.capture.id,
                    suggestionId: value.proposalId,
                    decision: value.decision,
                    selectedProjectId: approved ? value.projectId : null,
                    selectedKind: approved ? "note" : null,
                    selectedTitle: approved ? value.selectedTitle : null,
                    selectedBody: approved ? value.selectedBody : null,
                    filedRecordId: approved ? access.createId() : null,
                    actor: context.actor.principalId,
                    createdAt: access.now().toISOString(),
                    provenance: {
                      schemaVersion: 1,
                      projectId: value.projectId,
                      environment: context.request.environment,
                      proposalVersion: value.expectedVersion,
                      proposalDigest: value.expectedProposalDigest,
                      sourceDigest: value.expectedSourceDigest,
                      citationsDigest: value.expectedCitationsDigest,
                      reviewedBy: context.actor.principalId,
                      correlationId: context.request.correlationId,
                      reason: value.reason,
                    },
                  }),
                );
                const rawReceipt = await context.records.reviewFindingProposal({
                  decision,
                  memoryId,
                  anchorEvidenceId,
                });
                context.guard();
                const record = foundationWorkflowOutput(
                  foundationFindingProposalReviewReceiptSchema,
                  rawReceipt,
                );
                exact(record.decision, decision);
                let anchorEvidence: FoundationEvidence | null = null;
                if (approved) {
                  const rawAnchor =
                    await context.records.getEvidence(anchorEvidenceId);
                  context.guard();
                  anchorEvidence = foundationWorkflowOutput(
                    foundationEvidenceSchema,
                    rawAnchor,
                  );
                  const {
                    schemaVersion: _schema,
                    id: _id,
                    ingestedAt: _at,
                    recordedBy: _by,
                    verification: _verified,
                    ...reference
                  } = anchorEvidence;
                  await context.records.validateEvidenceReference(reference);
                  context.guard();
                }
                return {
                  record,
                  proof: {
                    detail: current,
                    memoryId: approved ? memoryId : null,
                    anchorEvidenceId: approved ? anchorEvidenceId : null,
                    anchorEvidence,
                  },
                };
              },
            ),
        ),
      );
    },
  };
}
