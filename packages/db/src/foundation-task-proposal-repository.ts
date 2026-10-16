import { and, eq, sql } from "drizzle-orm";
import {
  FoundationTaskProposalUnavailableError,
  type FoundationMachineRequest,
  type FoundationOwnerRequest,
  type FoundationRecordPort,
  type FoundationTaskProposalPort,
  type FoundationTaskProposalRecords,
} from "@commandry/application";
import {
  foundationTaskProposalDecisionSchema,
  foundationTaskProposalDetailSchema,
  foundationTaskProposalReviewReceiptSchema,
  type FoundationTaskProposalDetail,
} from "@commandry/contracts";
import { FoundationError, foundationDigest } from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import { captureRecord } from "./capture-repository";
import { fileCaptureTaskInTransaction } from "./capture-task-filing";
import {
  captureTriageDecisionRecord,
  captureTriageSuggestionRecord,
} from "./capture-triage-repository";
import { createFoundationRecordsAccessRepository } from "./foundation-access-repository";
import {
  foundationByteDigest,
  type FoundationTransaction,
} from "./foundation-record-repository";
import { canonicalWorkRecord } from "./project-work-query";
import {
  capture,
  captureTriageDecision,
  captureTriageSuggestion,
} from "./schema";

type Context =
  | {
      mode: "machine";
      request: FoundationMachineRequest & {
        principalId: string;
        clientId: string;
      };
    }
  | { mode: "owner"; request: FoundationOwnerRequest };

function unavailable(): never {
  throw new FoundationTaskProposalUnavailableError();
}
function denied(): never {
  throw new FoundationError(
    "INVALID_REFERENCE",
    "Task proposal scope unavailable",
  );
}
function conflict(): never {
  throw new FoundationError(
    "VERSION_CONFLICT",
    "Task proposal is stale or terminal",
  );
}
function output<T>(produce: () => T): T {
  try {
    return produce();
  } catch {
    unavailable();
  }
}
function exact<T>(schema: { parse(value: unknown): T }, raw: unknown): T {
  return output(() => {
    const parsed = schema.parse(raw);
    if (foundationDigest(parsed) !== foundationDigest(raw)) unavailable();
    return parsed;
  });
}
function instant(raw: string): Date {
  return output(() => {
    const date = new Date(raw);
    if (date.toISOString() !== raw) unavailable();
    return date;
  });
}

function proposalRecords(
  tx: FoundationTransaction,
  context: Context,
  records: FoundationRecordPort,
): FoundationTaskProposalRecords {
  const { request } = context;
  if (context.mode === "machine") {
    if (request.operation !== "work.propose") denied();
  } else if (
    !request.principalId.startsWith("user:") ||
    !request.principalId.slice(5).trim() ||
    !["work.proposal.read", "work.proposal.review"].includes(request.operation)
  ) {
    denied();
  }
  function requireMethod(
    mode: Context["mode"],
    operation: string,
    target: string | null,
  ) {
    if (
      context.mode !== mode ||
      request.operation !== operation ||
      request.targetId !== target
    )
      denied();
  }
  function checkedDetail(raw: unknown): FoundationTaskProposalDetail {
    const detail = exact(foundationTaskProposalDetailSchema, raw);
    const binding = detail.suggestion.proposal.binding;
    if (
      binding.projectId !== request.projectId ||
      binding.environment !== request.environment ||
      foundationByteDigest(detail.capture.originalContent) !==
        binding.sourceDigest ||
      output(() => foundationDigest(binding)) !==
        detail.suggestion.proposal.contentDigest
    )
      unavailable();
    return detail;
  }
  async function load(selector: { proposalId?: string; captureId?: string }) {
    const predicate = and(
      eq(capture.source, "foundation-client"),
      eq(capture.projectId, request.projectId),
      sql`${captureTriageSuggestion.proposal}->'binding'->>'environment' = ${request.environment}`,
      selector.proposalId === undefined
        ? undefined
        : eq(captureTriageSuggestion.id, selector.proposalId),
      selector.captureId === undefined
        ? undefined
        : eq(capture.id, selector.captureId),
    );
    // Fetch only scoped IDs before locking. Reapply the complete selector in the
    // fresh statement after the Capture lock, then load the current decision.
    const [candidate] = await tx
      .select({ id: capture.id })
      .from(capture)
      .innerJoin(
        captureTriageSuggestion,
        eq(captureTriageSuggestion.captureId, capture.id),
      )
      .where(predicate);
    if (!candidate) return null;
    const [locked] = await tx
      .select({ id: capture.id })
      .from(capture)
      .where(
        and(
          eq(capture.id, candidate.id),
          eq(capture.source, "foundation-client"),
          eq(capture.projectId, request.projectId),
        ),
      )
      .for("update");
    if (!locked) return null;
    const [row] = await tx
      .select({ capture, suggestion: captureTriageSuggestion })
      .from(capture)
      .innerJoin(
        captureTriageSuggestion,
        eq(captureTriageSuggestion.captureId, capture.id),
      )
      .where(and(predicate, eq(capture.id, locked.id)));
    if (!row) return null;
    const [decision] = await tx
      .select()
      .from(captureTriageDecision)
      .where(
        and(
          eq(captureTriageDecision.captureId, locked.id),
          eq(captureTriageDecision.suggestionId, row.suggestion.id),
        ),
      );
    return checkedDetail(
      output(() => ({
        capture: captureRecord(row.capture),
        suggestion: captureTriageSuggestionRecord(row.suggestion),
        decision: decision ? captureTriageDecisionRecord(decision) : null,
      })),
    );
  }

  return {
    ...records,
    async insertTaskProposal(raw) {
      requireMethod("machine", "work.propose", null);
      if (context.mode !== "machine") denied();
      const detail = checkedDetail(raw);
      const { capture: original, suggestion } = detail;
      const binding = suggestion.proposal.binding;
      if (
        detail.decision !== null ||
        original.state !== "unfiled" ||
        binding.clientId !== context.request.clientId ||
        binding.principalId !== request.principalId ||
        binding.correlationId !== request.correlationId
      )
        unavailable();
      const at = instant(binding.submittedAt);
      await tx.insert(capture).values({
        id: original.id,
        inputType: "text",
        originalContent: original.originalContent,
        source: "foundation-client",
        author: request.principalId,
        state: "unfiled",
        projectId: request.projectId,
        createdAt: at,
      });
      await tx.insert(captureTriageSuggestion).values({
        id: suggestion.id,
        captureId: original.id,
        kind: "task",
        proposedProjectId: request.projectId,
        title: suggestion.title,
        body: suggestion.body,
        confidence: null,
        rationale: suggestion.rationale,
        ruleVersion: suggestion.ruleVersion,
        sourceLabel: suggestion.sourceLabel,
        proposal: suggestion.proposal,
        createdAt: at,
      });
      const persisted = await load({ proposalId: suggestion.id });
      if (
        !persisted ||
        foundationDigest(persisted) !== foundationDigest(detail)
      )
        unavailable();
      return persisted;
    },
    async getTaskProposal(proposalId, lock) {
      requireMethod("owner", "work.proposal.review", proposalId);
      if (lock !== true) denied();
      return load({ proposalId });
    },
    async getTaskProposalByCapture(captureId) {
      requireMethod("owner", "work.proposal.read", captureId);
      return load({ captureId });
    },
    async reviewTaskProposal(input) {
      const decision = exact(
        foundationTaskProposalDecisionSchema,
        input.decision,
      );
      requireMethod("owner", "work.proposal.review", decision.suggestionId);
      const current = await load({ proposalId: decision.suggestionId });
      if (!current)
        throw new FoundationError("NOT_FOUND", "Task proposal not found");
      if (current.decision !== null || current.capture.state !== "unfiled")
        conflict();
      const binding = current.suggestion.proposal.binding;
      const provenance = decision.provenance;
      if (
        decision.actor !== request.principalId ||
        provenance.reviewedBy !== request.principalId ||
        provenance.correlationId !== request.correlationId ||
        decision.captureId !== current.capture.id ||
        provenance.projectId !== request.projectId ||
        provenance.environment !== request.environment
      )
        denied();
      if (
        provenance.proposalVersion !== binding.proposalVersion ||
        provenance.sourceDigest !== binding.sourceDigest ||
        provenance.proposalDigest !== current.suggestion.proposal.contentDigest
      )
        conflict();
      const at = instant(decision.createdAt);
      let work = null;
      if (decision.decision === "approve") {
        if (
          decision.filedRecordId === null ||
          decision.selectedTitle === null ||
          decision.selectedBody === null
        )
          unavailable();
        const filed = await fileCaptureTaskInTransaction(tx, {
          captureId: current.capture.id,
          recordId: decision.filedRecordId,
          projectId: request.projectId,
          title: decision.selectedTitle,
          description: decision.selectedBody,
          at,
        });
        work = output(() => canonicalWorkRecord(filed.record, null));
      }
      const [row] = await tx
        .insert(captureTriageDecision)
        .values({
          id: decision.id,
          captureId: decision.captureId,
          suggestionId: decision.suggestionId,
          decision: decision.decision,
          selectedProjectId: decision.selectedProjectId,
          selectedKind: decision.selectedKind,
          selectedTitle: decision.selectedTitle,
          selectedBody: decision.selectedBody,
          filedRecordId: decision.filedRecordId,
          actor: request.principalId,
          provenance,
          createdAt: at,
        })
        .returning();
      if (!row) unavailable();
      const persisted = exact(
        foundationTaskProposalDecisionSchema,
        output(() => captureTriageDecisionRecord(row)),
      );
      if (foundationDigest(persisted) !== foundationDigest(decision))
        unavailable();
      const detail = await load({ proposalId: decision.suggestionId });
      if (
        !detail ||
        foundationDigest(detail.decision) !== foundationDigest(persisted) ||
        foundationDigest(detail.suggestion) !==
          foundationDigest(current.suggestion) ||
        detail.capture.originalContent !== current.capture.originalContent
      )
        unavailable();
      return exact(foundationTaskProposalReviewReceiptSchema, {
        schemaVersion: 1,
        proposalId: binding.proposalId,
        captureId: binding.captureId,
        projectId: request.projectId,
        environment: request.environment,
        decision: persisted,
        work,
      });
    },
  };
}

export function createFoundationTaskProposalAccessRepository(
  db: CommandryDatabase,
  options: { now?: () => Date } = {},
): FoundationTaskProposalPort {
  return createFoundationRecordsAccessRepository(
    db,
    {
      machine: (tx, request, records) =>
        proposalRecords(tx, { mode: "machine", request }, records),
      owner: (tx, request, records) =>
        proposalRecords(tx, { mode: "owner", request }, records),
    },
    options,
  );
}
