import {
  FOUNDATION_ONBOARDING_MAX_INPUT_BYTES,
  foundationActorSchema,
  foundationEvidenceSchema,
  foundationIdempotencyKeySchema,
  foundationOnboardingApplyInputSchema,
  foundationOnboardingDecisionSchema,
  foundationOnboardingDetailSchema,
  foundationOnboardingInputSchema,
  foundationOnboardingMachineDetailSchema,
  foundationOnboardingOutcomeSchema,
  foundationOnboardingPageSchema,
  foundationOnboardingPreconditionsSchema,
  foundationOnboardingPreviewSchema,
  foundationOnboardingProposalSchema,
  foundationOnboardingReviewInputSchema,
  foundationReadRecordSchema,
  foundationWorkflowListQuerySchema,
  type FoundationEvidenceInput,
  type FoundationOnboardingDecision,
  type FoundationOnboardingDetail,
  type FoundationOnboardingMachineDetail,
  type FoundationOnboardingOutcome,
  type FoundationOnboardingPage,
  type FoundationOnboardingPreconditions,
  type FoundationOnboardingPreview,
  type FoundationOnboardingProposal,
  type FoundationWorkflowListQuery,
} from "@commandry/contracts";
import {
  FoundationError,
  canonicalFoundationJson,
  foundationDigest,
  foundationInstantMilliseconds,
} from "@commandry/domain";
import type {
  FoundationIdentity,
  FoundationMutationResult,
  FoundationRecordPort,
  FoundationServiceOptions,
} from "./agent-foundation";
import {
  createFoundationWorkflowAccess,
  foundationWorkflowOutput,
  foundationWorkflowSnapshot,
  FoundationWorkflowUnavailableError,
  type FoundationWorkflowContext,
  type FoundationWorkflowPort,
} from "./foundation-workflow-access";
import {
  foundationWorkflowPageCursor,
  foundationWorkflowPageSelection,
} from "./foundation-workflow-pagination";

/** Inventory inspection and canonical writes are owner-only adapter operations.
 * The adapter owns transaction locks, identity uniqueness, proposal-wide outcome
 * uniqueness, canonical inventory writers, session revocation and atomic audit. */
export interface FoundationOnboardingRecords extends FoundationRecordPort {
  getProposal(id: string): Promise<FoundationOnboardingProposal | null>;
  insertProposal(
    record: FoundationOnboardingProposal,
  ): Promise<FoundationOnboardingProposal>;
  listProposals(query: {
    limit: number;
    afterId: string | null;
    asOf: string;
  }): Promise<{
    items: FoundationOnboardingProposal[];
    nextAfterId: string | null;
  }>;
  getCurrentDecision(
    proposalId: string,
  ): Promise<FoundationOnboardingDecision | null>;
  insertDecision(
    record: FoundationOnboardingDecision,
    expectedVersion: number,
  ): Promise<FoundationOnboardingDecision>;
  getOutcome(proposalId: string): Promise<FoundationOnboardingOutcome | null>;
  inspectProposal(
    proposal: FoundationOnboardingProposal,
    lock: boolean,
  ): Promise<FoundationOnboardingPreconditions>;
  applyInventory(input: {
    proposal: FoundationOnboardingProposal;
    decision: FoundationOnboardingDecision;
    outcomeId: string;
    resourceId: string;
    linkId: string;
    correlationId: string;
    recordedBy: string;
    recordedAt: string;
  }): Promise<FoundationOnboardingOutcome>;
}
export type FoundationOnboardingPort =
  FoundationWorkflowPort<FoundationOnboardingRecords>;
type Context = FoundationWorkflowContext<FoundationOnboardingRecords>;
type Signed = { contentDigest: string };
type Schema<T> = { parse(value: unknown): T };
const MAX_VERSION = 2147483647;
const MAX_EXPIRY = 30 * 24 * 60 * 60 * 1000;

function unavailable(): never {
  throw new FoundationWorkflowUnavailableError();
}
function invalid(): never {
  throw new FoundationError(
    "INVALID_REFERENCE",
    "Invalid onboarding reference",
  );
}
function conflict(): never {
  throw new FoundationError("VERSION_CONFLICT", "Onboarding state changed");
}
function equal(left: unknown, right: unknown): boolean {
  return foundationDigest(left) === foundationDigest(right);
}
function frozen<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
}
function capture<T>(value: T): T {
  return frozen(foundationWorkflowSnapshot(value));
}
function input<T>(schema: Schema<T>, raw: unknown): T {
  const copy = foundationWorkflowSnapshot(raw, invalid);
  if (
    Buffer.byteLength(canonicalFoundationJson(copy), "utf8") >
    FOUNDATION_ONBOARDING_MAX_INPUT_BYTES
  )
    invalid();
  const parsed = schema.parse(copy);
  if (!equal(parsed, copy)) invalid();
  return frozen(parsed);
}
function unsigned<T extends Signed>(value: T): Omit<T, "contentDigest"> {
  const { contentDigest: _digest, ...rest } = value;
  return rest;
}
function signed<T extends Signed>(schema: Schema<T>, raw: unknown): T {
  const record = foundationWorkflowOutput(schema, raw);
  if (record.contentDigest !== foundationDigest(unsigned(record)))
    unavailable();
  return frozen(record);
}
function instant(value: string): number {
  const milliseconds = foundationInstantMilliseconds(value);
  if (!Number.isFinite(milliseconds)) unavailable();
  return milliseconds;
}
function compareInstant(left: string, right: string): number {
  const difference = instant(left) - instant(right);
  if (difference !== 0) return difference;
  const tail = (value: string) => (value.match(/\.(\d+)/)?.[1] ?? "").slice(3);
  const a = tail(left),
    b = tail(right),
    length = Math.max(a.length, b.length);
  return a.padEnd(length, "0").localeCompare(b.padEnd(length, "0"));
}
function exactKeys(
  value: unknown,
  keys: string[],
): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join("|") !== [...keys].sort().join("|")
  )
    unavailable();
}
async function io<T>(context: Context, perform: () => Promise<T>): Promise<T> {
  context.guard();
  const value = await perform();
  context.guard();
  return value === undefined ? value : foundationWorkflowSnapshot(value);
}
function proposalRecord(
  raw: unknown,
  context: Context,
): FoundationOnboardingProposal {
  const record = signed(foundationOnboardingProposalSchema, raw);
  instant(record.recordedAt);
  if (
    record.projectId !== context.request.projectId ||
    record.environment !== context.request.environment
  )
    throw new FoundationError(
      "NOT_FOUND",
      "Onboarding proposal is unavailable",
    );
  const prefix = "foundation-client:";
  if (
    !record.recordedBy.startsWith(prefix) ||
    !foundationActorSchema.shape.projectId.safeParse(
      record.recordedBy.slice(prefix.length),
    ).success
  )
    unavailable();
  return record;
}
function decisionRecord(
  raw: unknown,
  context: Context,
): FoundationOnboardingDecision {
  const record = signed(foundationOnboardingDecisionSchema, raw);
  if (
    record.projectId !== context.request.projectId ||
    record.version > MAX_VERSION ||
    record.expectedDecisionVersion >= MAX_VERSION ||
    compareInstant(
      record.expiresAt,
      new Date(instant(record.recordedAt) + MAX_EXPIRY).toISOString(),
    ) > 0
  )
    unavailable();
  return record;
}
function outcomeRecord(
  raw: unknown,
  context: Context,
): FoundationOnboardingOutcome {
  const record = signed(foundationOnboardingOutcomeSchema, raw);
  if (
    record.projectId !== context.request.projectId ||
    record.decisionVersion > MAX_VERSION
  )
    unavailable();
  instant(record.recordedAt);
  return record;
}
function bindOutcome(
  outcome: FoundationOnboardingOutcome,
  proposal: FoundationOnboardingProposal,
): void {
  if (
    outcome.proposalId !== proposal.id ||
    outcome.proposalDigest !== proposal.contentDigest ||
    outcome.link.type !== proposal.relationship
  )
    unavailable();
  if (proposal.target.mode === "reuse") {
    if (
      outcome.resource.id !== proposal.target.resourceId ||
      outcome.resourceCreated ||
      outcome.identity !== null
    )
      unavailable();
  } else {
    if (
      !outcome.resourceCreated ||
      !equal(outcome.identity, proposal.target.identity) ||
      outcome.resource.name !== proposal.target.name ||
      outcome.resource.subtype !== proposal.target.subtype ||
      outcome.resource.externalUrl !== proposal.target.externalUrl ||
      outcome.resource.parentResourceId !== null ||
      outcome.resource.state !== null ||
      outcome.resource.lastObservedAt !== null
    )
      unavailable();
  }
}
function liveDecision(decision: FoundationOnboardingDecision, now: Date): void {
  if (
    decision.decision !== "approved" ||
    !(instant(decision.expiresAt) > now.getTime())
  )
    throw new FoundationError(
      "APPROVAL_REQUIRED",
      "An exact live onboarding approval is required",
    );
}
function futureExpiry(expiresAt: string, now: Date): void {
  const delta = instant(expiresAt) - now.getTime();
  if (
    !(delta > 0) ||
    compareInstant(
      expiresAt,
      new Date(now.getTime() + MAX_EXPIRY).toISOString(),
    ) > 0
  )
    invalid();
}

export function createFoundationOnboardingService(
  port: FoundationOnboardingPort,
  options: FoundationServiceOptions,
) {
  const access = createFoundationWorkflowAccess(port, options);
  async function getProposal(
    context: Context,
    id: string,
  ): Promise<FoundationOnboardingProposal> {
    const raw = await io(context, () => context.records.getProposal(id));
    context.guard();
    if (raw === null)
      throw new FoundationError(
        "NOT_FOUND",
        "Onboarding proposal is unavailable",
      );
    const proposal = proposalRecord(raw, context);
    if (proposal.id !== id) unavailable();
    return proposal;
  }
  async function currentDecision(
    context: Context,
    proposal: FoundationOnboardingProposal,
  ): Promise<FoundationOnboardingDecision | null> {
    const raw = await io(context, () =>
      context.records.getCurrentDecision(proposal.id),
    );
    context.guard();
    if (raw === null) return null;
    const decision = decisionRecord(raw, context);
    if (
      decision.proposalId !== proposal.id ||
      decision.expectedProposalDigest !== proposal.contentDigest
    )
      unavailable();
    return decision;
  }
  async function getOutcome(
    context: Context,
    proposal: FoundationOnboardingProposal,
  ): Promise<FoundationOnboardingOutcome | null> {
    const raw = await io(context, () =>
      context.records.getOutcome(proposal.id),
    );
    context.guard();
    if (raw === null) return null;
    const outcome = outcomeRecord(raw, context);
    bindOutcome(outcome, proposal);
    return outcome;
  }
  async function detail(
    context: Context,
    id: string,
  ): Promise<FoundationOnboardingDetail> {
    const proposal = await getProposal(context, id);
    context.guard();
    const decision = await currentDecision(context, proposal);
    context.guard();
    const outcome = await getOutcome(context, proposal);
    context.guard();
    return foundationWorkflowOutput(foundationOnboardingDetailSchema, {
      schemaVersion: 1,
      proposal,
      currentDecision: decision,
      outcome,
    });
  }
  async function evidence(
    context: Context,
    proposal: Pick<FoundationOnboardingProposal, "evidenceIds" | "projectId">,
    preview: boolean,
  ): Promise<boolean> {
    try {
      await io(context, () =>
        context.records.assertReferences(
          capture({
            evidenceIds: proposal.evidenceIds,
            memoryIds: [],
            configurationIds: [],
          }),
        ),
      );
      context.guard();
      for (const id of proposal.evidenceIds) {
        const raw = await io(context, () => context.records.getEvidence(id));
        context.guard();
        if (raw === null) invalid();
        const source = foundationWorkflowOutput(foundationEvidenceSchema, raw);
        if (source.id !== id || source.projectId !== proposal.projectId)
          invalid();
        if (source.availability !== "available") {
          if (preview) return false;
          continue;
        }
        const reference: FoundationEvidenceInput = {
          projectId: source.projectId,
          sourceKind: source.sourceKind,
          sourceId: source.sourceId,
          sourceVersion: source.sourceVersion,
          contentDigest: source.contentDigest,
          locator: source.locator,
          observedAt: source.observedAt,
          availability: source.availability,
        };
        await io(context, () =>
          context.records.validateEvidenceReference(capture(reference)),
        );
        context.guard();
      }
      return true;
    } catch (error) {
      context.guard();
      if (
        preview &&
        error instanceof FoundationError &&
        error.code === "INVALID_REFERENCE"
      )
        return false;
      throw error;
    }
  }
  async function inspect(
    context: Context,
    proposal: FoundationOnboardingProposal,
    lock: boolean,
  ): Promise<FoundationOnboardingPreview> {
    const raw = await io(context, () =>
      context.records.inspectProposal(capture(proposal), lock),
    );
    context.guard();
    const preconditions = foundationWorkflowOutput(
      foundationOnboardingPreconditionsSchema,
      raw,
    );
    if (
      preconditions.link &&
      (preconditions.link.projectId !== proposal.projectId ||
        preconditions.link.type !== proposal.relationship)
    )
      unavailable();
    if (proposal.target.mode === "reuse") {
      const resourceId = proposal.target.resourceId;
      if (
        [
          preconditions.resource?.id,
          preconditions.link?.resourceId,
          preconditions.identityResourceId,
        ].some((id) => id != null && id !== resourceId)
      )
        unavailable();
    } else if (
      (preconditions.resource || preconditions.link) &&
      preconditions.identityResourceId === null
    )
      unavailable();
    const blockers: FoundationOnboardingPreview["blockers"] = [];
    if (proposal.target.mode === "reuse" && preconditions.resource === null)
      blockers.push("resource_unavailable");
    if (preconditions.resource && preconditions.resource.kind !== "host")
      blockers.push("resource_not_host");
    if (preconditions.link?.lifecycle === "archived")
      blockers.push("archived_connection");
    if (
      proposal.target.mode === "create" &&
      preconditions.identityResourceId !== null
    )
      blockers.push(
        preconditions.resource ? "identity_conflict" : "identity_unresolved",
      );
    const available = await evidence(context, proposal, true);
    context.guard();
    if (!available) blockers.push("source_unavailable");
    const core = {
      schemaVersion: 1 as const,
      projectId: proposal.projectId,
      proposalId: proposal.id,
      proposalDigest: proposal.contentDigest,
      preconditionsDigest: foundationDigest(preconditions),
      blockers,
      canApply: blockers.length === 0,
    };
    return foundationWorkflowOutput(foundationOnboardingPreviewSchema, {
      ...core,
      evaluatedAt: access.now().toISOString(),
      preconditions,
      previewDigest: foundationDigest(core),
    });
  }

  async function mutation<T extends Signed>(
    context: Context,
    key: string,
    rawInput: unknown,
    schema: Schema<T>,
    validate: (record: T) => void,
    perform: (context: Context) => Promise<T>,
  ): Promise<FoundationMutationResult<T>> {
    const binding = {
      schemaVersion: 1,
      operation: context.request.operation,
      projectId: context.request.projectId,
      environment: context.request.environment,
      principalId: context.actor.principalId,
      input: rawInput,
    };
    const requestDigest = foundationDigest(binding);
    let open = true,
      calls = 0,
      finished = false;
    let produced: string | undefined;
    const guard = () => {
      if (!open) unavailable();
      context.guard();
    };
    let raw: unknown;
    try {
      guard();
      raw = await context.records.idempotent(
        context.request.operation + ":" + key,
        requestDigest,
        async () => {
          if (!open || ++calls !== 1) unavailable();
          guard();
          const performed = await perform({ ...context, guard });
          guard();
          const record = signed(schema, performed);
          validate(record);
          const value = {
            ...binding,
            requestDigest,
            record,
            correlationId: context.request.correlationId,
          };
          const receipt = capture({
            ...value,
            resultDigest: foundationDigest(value),
          });
          produced = foundationDigest(receipt);
          finished = true;
          return receipt;
        },
      );
      guard();
      raw = foundationWorkflowSnapshot(raw);
    } finally {
      open = false;
    }
    exactKeys(raw, ["value", "replayed"]);
    if (
      typeof raw.replayed !== "boolean" ||
      (raw.replayed ? calls !== 0 : calls !== 1 || !finished)
    )
      unavailable();
    const value = raw.value;
    exactKeys(value, [
      "schemaVersion",
      "operation",
      "projectId",
      "environment",
      "principalId",
      "input",
      "requestDigest",
      "record",
      "correlationId",
      "resultDigest",
    ]);
    const { resultDigest, ...receipt } = value;
    if (
      typeof resultDigest !== "string" ||
      foundationDigest(receipt) !== resultDigest ||
      value.requestDigest !== requestDigest
    )
      unavailable();
    for (const name of [
      "schemaVersion",
      "operation",
      "projectId",
      "environment",
      "principalId",
      "input",
    ] as const)
      if (!equal(value[name], binding[name])) unavailable();
    const correlationId = foundationWorkflowOutput(
      foundationActorSchema.shape.correlationId,
      value.correlationId,
    );
    if (
      !raw.replayed &&
      (produced !== foundationDigest(value) ||
        correlationId !== context.request.correlationId)
    )
      unavailable();
    const record = signed(schema, value.record);
    validate(record);
    context.guard();
    return { record, replayed: raw.replayed, correlationId };
  }

  async function page(
    context: Context,
    query: FoundationWorkflowListQuery,
  ): Promise<FoundationOnboardingPage> {
    const binding = {
      projectId: context.request.projectId,
      environment: context.request.environment,
      principalId: context.actor.principalId,
      operation: context.request.operation,
    };
    const selection = foundationWorkflowPageSelection(
      binding,
      query.cursor,
      access.now(),
    );
    const raw = await io(context, () =>
      context.records.listProposals(
        capture({ limit: query.limit, ...selection }),
      ),
    );
    context.guard();
    exactKeys(raw, ["items", "nextAfterId"]);
    if (!Array.isArray(raw.items) || raw.items.length > query.limit)
      unavailable();
    const items = raw.items.map((entry) => proposalRecord(entry, context));
    let previous = selection.afterId;
    for (const item of items) {
      if (
        (previous !== null && item.id <= previous) ||
        compareInstant(item.recordedAt, selection.asOf) > 0
      )
        unavailable();
      previous = item.id;
    }
    if (
      raw.nextAfterId !== null &&
      (items.length !== query.limit || raw.nextAfterId !== previous)
    )
      unavailable();
    return foundationWorkflowOutput(foundationOnboardingPageSchema, {
      schemaVersion: 1,
      projectId: query.projectId,
      items,
      nextCursor:
        raw.nextAfterId === null
          ? null
          : foundationWorkflowPageCursor(
              binding,
              selection,
              raw.nextAfterId as string,
            ),
    });
  }

  return {
    async propose(
      token: string,
      rawKey: string,
      raw: unknown,
    ): Promise<FoundationMutationResult<FoundationOnboardingProposal>> {
      const proposalInput = input(foundationOnboardingInputSchema, raw);
      const key = foundationIdempotencyKeySchema.parse(rawKey);
      return access.machine(
        token,
        "onboarding.propose",
        proposalInput.projectId,
        null,
        (context) =>
          mutation(
            context,
            key,
            proposalInput,
            foundationOnboardingProposalSchema,
            (record) => {
              proposalRecord(record, context);
              if (
                record.recordedBy !== context.actor.principalId ||
                !equal(unsigned(record), {
                  ...proposalInput,
                  schemaVersion: 1,
                  id: record.id,
                  version: 1,
                  environment: context.request.environment,
                  recordedBy: context.actor.principalId,
                  recordedAt: record.recordedAt,
                })
              )
                unavailable();
            },
            async (active) => {
              await evidence(active, proposalInput, false);
              active.guard();
              const value = {
                ...proposalInput,
                schemaVersion: 1 as const,
                id: access.createId(),
                version: 1 as const,
                environment: active.request.environment,
                recordedBy: active.actor.principalId,
                recordedAt: access.now().toISOString(),
              };
              const record = capture({
                ...value,
                contentDigest: foundationDigest(value),
              });
              const saved = await io(active, () =>
                active.records.insertProposal(record),
              );
              active.guard();
              const returned = proposalRecord(saved, active);
              if (!equal(returned, record)) unavailable();
              return returned;
            },
          ),
      );
    },
    async get(
      token: string,
      raw: { projectId: string; id: string },
    ): Promise<FoundationOnboardingMachineDetail> {
      const query = input(foundationReadRecordSchema, raw);
      return access.machine(
        token,
        "onboarding.read",
        query.projectId,
        query.id,
        async (context) => {
          const value = await detail(context, query.id);
          context.guard();
          const decision = value.currentDecision,
            outcome = value.outcome;
          return foundationWorkflowOutput(
            foundationOnboardingMachineDetailSchema,
            {
              schemaVersion: 1,
              proposal: value.proposal,
              currentDecision: decision
                ? {
                    id: decision.id,
                    version: decision.version,
                    decision: decision.decision,
                    expiresAt: decision.expiresAt,
                  }
                : null,
              outcome: outcome
                ? {
                    id: outcome.id,
                    resourceId: outcome.resource.id,
                    linkId: outcome.link.id,
                    recordedAt: outcome.recordedAt,
                  }
                : null,
            },
          );
        },
      );
    },
    async list(
      token: string,
      raw: FoundationWorkflowListQuery,
    ): Promise<FoundationOnboardingPage> {
      const query = input(foundationWorkflowListQuerySchema, raw);
      return access.machine(
        token,
        "onboarding.read",
        query.projectId,
        null,
        (context) => page(context, query),
      );
    },
    async getOwner(
      identity: FoundationIdentity,
      raw: { projectId: string; id: string },
    ): Promise<FoundationOnboardingDetail> {
      const query = input(foundationReadRecordSchema, raw);
      return access.owner(
        identity,
        "onboarding.read",
        query.projectId,
        query.id,
        (context) => detail(context, query.id),
      );
    },
    async listOwner(
      identity: FoundationIdentity,
      raw: FoundationWorkflowListQuery,
    ): Promise<FoundationOnboardingPage> {
      const query = input(foundationWorkflowListQuerySchema, raw);
      return access.owner(
        identity,
        "onboarding.read",
        query.projectId,
        null,
        (context) => page(context, query),
      );
    },
    async preview(
      identity: FoundationIdentity,
      raw: { projectId: string; id: string },
    ): Promise<FoundationOnboardingPreview> {
      const query = input(foundationReadRecordSchema, raw);
      return access.owner(
        identity,
        "onboarding.read",
        query.projectId,
        query.id,
        async (context) => {
          const proposal = await getProposal(context, query.id);
          context.guard();
          return inspect(context, proposal, false);
        },
      );
    },
    async review(
      identity: FoundationIdentity,
      rawKey: string,
      raw: unknown,
    ): Promise<FoundationMutationResult<FoundationOnboardingDecision>> {
      const reviewInput = input(foundationOnboardingReviewInputSchema, raw);
      if (reviewInput.expectedDecisionVersion >= MAX_VERSION) invalid();
      const key = foundationIdempotencyKeySchema.parse(rawKey);
      const result = await access.owner(
        identity,
        "onboarding.review",
        reviewInput.projectId,
        reviewInput.proposalId,
        async (context) => {
          const reviewed = await mutation(
            context,
            key,
            reviewInput,
            foundationOnboardingDecisionSchema,
            (record) => {
              decisionRecord(record, context);
              if (
                record.recordedBy !== context.actor.principalId ||
                !equal(unsigned(record), {
                  ...reviewInput,
                  schemaVersion: 1,
                  id: record.id,
                  version: reviewInput.expectedDecisionVersion + 1,
                  recordedBy: context.actor.principalId,
                  recordedAt: record.recordedAt,
                  preconditions: record.preconditions,
                })
              )
                unavailable();
            },
            async (active) => {
              const guard = () => {
                active.guard();
                futureExpiry(reviewInput.expiresAt, access.now());
              };
              const current = { ...active, guard };
              guard();
              const proposal = await getProposal(
                current,
                reviewInput.proposalId,
              );
              guard();
              if (proposal.contentDigest !== reviewInput.expectedProposalDigest)
                conflict();
              const decision = await currentDecision(current, proposal);
              guard();
              if (
                (decision?.version ?? 0) !== reviewInput.expectedDecisionVersion
              )
                conflict();
              const preview = await inspect(current, proposal, false);
              guard();
              if (preview.previewDigest !== reviewInput.expectedPreviewDigest)
                conflict();
              if (reviewInput.decision === "approved" && !preview.canApply)
                throw new FoundationError(
                  "APPROVAL_REQUIRED",
                  "Inventory review is blocked",
                );
              const value = {
                ...reviewInput,
                schemaVersion: 1 as const,
                id: access.createId(),
                version: reviewInput.expectedDecisionVersion + 1,
                preconditions: preview.preconditions,
                recordedBy: current.actor.principalId,
                recordedAt: access.now().toISOString(),
              };
              const record = capture({
                ...value,
                contentDigest: foundationDigest(value),
              });
              const saved = await io(current, () =>
                current.records.insertDecision(
                  record,
                  reviewInput.expectedDecisionVersion,
                ),
              );
              guard();
              const returned = decisionRecord(saved, current);
              if (!equal(returned, record)) unavailable();
              return returned;
            },
          );
          context.guard();
          if (!reviewed.replayed)
            futureExpiry(reviewed.record.expiresAt, access.now());
          return reviewed;
        },
      );
      if (!result.replayed) futureExpiry(result.record.expiresAt, access.now());
      return result;
    },
    async apply(
      identity: FoundationIdentity,
      rawKey: string,
      raw: unknown,
    ): Promise<FoundationMutationResult<FoundationOnboardingOutcome>> {
      const applyInput = input(foundationOnboardingApplyInputSchema, raw);
      if (applyInput.expectedDecisionVersion > MAX_VERSION) invalid();
      const key = foundationIdempotencyKeySchema.parse(rawKey);
      let deliveryDecision: FoundationOnboardingDecision | null = null;
      const result = await access.owner(
        identity,
        "onboarding.apply",
        applyInput.projectId,
        applyInput.proposalId,
        (context) =>
          mutation(
            context,
            key,
            applyInput,
            foundationOnboardingOutcomeSchema,
            (record) => {
              outcomeRecord(record, context);
              if (
                record.recordedBy !== context.actor.principalId ||
                record.proposalId !== applyInput.proposalId ||
                record.proposalDigest !== applyInput.expectedProposalDigest ||
                record.decisionId !== applyInput.decisionId ||
                record.decisionVersion !== applyInput.expectedDecisionVersion ||
                record.decisionDigest !== applyInput.expectedDecisionDigest
              )
                unavailable();
            },
            async (active) => {
              const proposal = await getProposal(active, applyInput.proposalId);
              active.guard();
              if (proposal.contentDigest !== applyInput.expectedProposalDigest)
                conflict();
              const decision = await currentDecision(active, proposal);
              active.guard();
              if (
                !decision ||
                decision.id !== applyInput.decisionId ||
                decision.version !== applyInput.expectedDecisionVersion ||
                decision.contentDigest !== applyInput.expectedDecisionDigest
              )
                conflict();
              deliveryDecision = decision;
              const guard = () => {
                active.guard();
                liveDecision(decision, access.now());
              };
              const current = { ...active, guard };
              guard();
              const existingOutcome = await getOutcome(current, proposal);
              guard();
              if (existingOutcome) conflict();
              const preview = await inspect(current, proposal, true);
              guard();
              if (
                !preview.canApply ||
                preview.previewDigest !== decision.expectedPreviewDigest ||
                preview.preconditionsDigest !==
                  foundationDigest(decision.preconditions) ||
                !equal(preview.preconditions, decision.preconditions)
              )
                conflict();
              const resourceId =
                proposal.target.mode === "reuse"
                  ? proposal.target.resourceId
                  : access.createId();
              const linkId =
                preview.preconditions.link?.id ?? access.createId();
              const write = capture({
                proposal,
                decision,
                outcomeId: access.createId(),
                resourceId,
                linkId,
                correlationId: current.request.correlationId,
                recordedBy: current.actor.principalId,
                recordedAt: access.now().toISOString(),
              });
              const saved = await io(current, () =>
                current.records.applyInventory(write),
              );
              guard();
              const outcome = outcomeRecord(saved, current);
              bindOutcome(outcome, proposal);
              const resource =
                proposal.target.mode === "reuse"
                  ? preview.preconditions.resource
                  : {
                      id: resourceId,
                      kind: "host",
                      name: proposal.target.name,
                      subtype: proposal.target.subtype,
                      externalUrl: proposal.target.externalUrl,
                      parentResourceId: null,
                      state: null,
                      lastObservedAt: null,
                    };
              const expected = {
                schemaVersion: 1,
                id: write.outcomeId,
                projectId: proposal.projectId,
                proposalId: proposal.id,
                proposalVersion: 1,
                proposalDigest: proposal.contentDigest,
                decisionId: decision.id,
                decisionVersion: decision.version,
                decisionDigest: decision.contentDigest,
                resource,
                link: {
                  id: linkId,
                  projectId: proposal.projectId,
                  resourceId,
                  type: proposal.relationship,
                  lifecycle: "active",
                },
                resourceCreated: proposal.target.mode === "create",
                linkCreated: preview.preconditions.link === null,
                identity:
                  proposal.target.mode === "create"
                    ? proposal.target.identity
                    : null,
                recordedBy: write.recordedBy,
                recordedAt: write.recordedAt,
                correlationId: write.correlationId,
              };
              if (!equal(unsigned(outcome), expected)) unavailable();
              return outcome;
            },
          ),
      );
      if (deliveryDecision !== null)
        liveDecision(deliveryDecision, access.now());
      return result;
    },
  };
}
