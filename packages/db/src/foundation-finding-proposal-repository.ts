import { createHash } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type {
  FoundationFindingProposalPort,
  FoundationFindingProposalRecords,
  FoundationRecordPort,
} from "@commandry/application";
import {
  foundationFindingProposalDecisionSchema,
  foundationFindingProposalDetailSchema,
  foundationFindingProposalReviewReceiptSchema,
  type FoundationFindingCitation,
  type FoundationFindingProposalDetail,
} from "@commandry/contracts";
import { FoundationError, foundationDigest } from "@commandry/domain";
import { captureRecord } from "./capture-repository";
import {
  captureTriageDecisionRecord,
  captureTriageSuggestionRecord,
} from "./capture-triage-repository";
import { fileCaptureNoteInTransaction } from "./capture-note-filing";
import type { CommandryDatabase } from "./client";
import type { FoundationTransaction } from "./foundation-record-repository";
import {
  foundationFindingCitation,
  foundationFindingFiling,
  foundationFindingProposal,
} from "./foundation-finding-schema";
import { foundationClient } from "./foundation-schema";
import {
  createFoundationWorkflowAccessRepository,
  type FoundationWorkflowRecordContext,
} from "./foundation-workflow-access-repository";
import {
  capture,
  captureTriageDecision,
  captureTriageSuggestion,
} from "./schema";

const foundationByteDigest = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

function invalid(): never {
  throw new FoundationError("INVALID_REFERENCE", "Invalid finding reference");
}
function forbidden(): never {
  throw new FoundationError("FORBIDDEN");
}
function same(actual: unknown, expected: unknown) {
  if (foundationDigest(actual) !== foundationDigest(expected)) invalid();
}

export function createFoundationFindingProposalRecordRepository(
  tx: FoundationTransaction,
  context: FoundationWorkflowRecordContext,
  records: FoundationRecordPort,
  now: () => Date,
): FoundationFindingProposalRecords {
  const request = context.request;
  const scope = request.projectId;
  const access = (
    operation: string,
    target: string | null,
    mode?: "machine" | "owner",
  ) => {
    if (
      request.operation !== operation ||
      request.targetId !== target ||
      (mode && context.mode !== mode)
    )
      forbidden();
  };
  const validateCitations = async (
    values: readonly FoundationFindingCitation[],
  ) => {
    await records.assertReferences({
      evidenceIds: values.map((value) => value.evidenceId),
      memoryIds: [],
      configurationIds: [],
    });
    for (const citation of values) {
      const evidence = await records.getEvidence(citation.evidenceId);
      if (
        !evidence ||
        evidence.projectId !== scope ||
        evidence.availability !== "available" ||
        citation.selection !== "whole_source"
      )
        invalid();
      same(
        {
          evidenceId: evidence.id,
          sourceKind: evidence.sourceKind,
          sourceId: evidence.sourceId,
          sourceVersion: evidence.sourceVersion,
          contentDigest: evidence.contentDigest,
          selection: "whole_source",
        },
        citation,
      );
      const {
        schemaVersion: _schema,
        id: _id,
        ingestedAt: _at,
        recordedBy: _by,
        verification: _verification,
        ...reference
      } = evidence;
      await records.validateEvidenceReference(reference);
    }
  };
  const load = async (
    selector: { proposalId?: string; captureId?: string },
    lock: boolean,
  ): Promise<FoundationFindingProposalDetail | null> => {
    const [anchor] = await tx
      .select()
      .from(foundationFindingProposal)
      .where(
        and(
          eq(foundationFindingProposal.projectId, scope),
          eq(foundationFindingProposal.environment, request.environment),
          selector.proposalId
            ? eq(foundationFindingProposal.proposalId, selector.proposalId)
            : eq(foundationFindingProposal.captureId, selector.captureId!),
        ),
      );
    if (!anchor) return null;
    const query = tx
      .select()
      .from(capture)
      .where(
        and(eq(capture.id, anchor.captureId), eq(capture.projectId, scope)),
      );
    const [source] = await query.for(lock ? "update" : "share");
    const [suggestion] = await tx
      .select()
      .from(captureTriageSuggestion)
      .where(
        and(
          eq(captureTriageSuggestion.id, anchor.proposalId),
          eq(captureTriageSuggestion.captureId, anchor.captureId),
        ),
      );
    if (
      !source ||
      !suggestion ||
      source.source !== "foundation-client" ||
      suggestion.ruleVersion !== "agent-finding-proposal/v1"
    )
      return null;
    const [decision] = await tx
      .select()
      .from(captureTriageDecision)
      .where(eq(captureTriageDecision.captureId, source.id));
    const detail = foundationFindingProposalDetailSchema.parse({
      capture: captureRecord(source),
      suggestion: captureTriageSuggestionRecord(suggestion),
      decision: decision ? captureTriageDecisionRecord(decision) : null,
    });
    const binding = detail.suggestion.proposal.binding;
    const [client] = await tx
      .select()
      .from(foundationClient)
      .where(
        and(
          eq(foundationClient.id, binding.clientId),
          eq(foundationClient.projectId, scope),
          eq(foundationClient.environment, request.environment),
        ),
      );
    if (
      !client ||
      binding.environment !== request.environment ||
      binding.projectId !== scope ||
      binding.sourceDigest !==
        foundationByteDigest(detail.capture.originalContent) ||
      binding.citationsDigest !== foundationDigest(binding.citations) ||
      detail.suggestion.proposal.contentDigest !== foundationDigest(binding)
    )
      invalid();
    const citations = await tx
      .select()
      .from(foundationFindingCitation)
      .where(
        and(
          eq(foundationFindingCitation.proposalId, anchor.proposalId),
          eq(foundationFindingCitation.projectId, scope),
        ),
      )
      .orderBy(asc(foundationFindingCitation.ordinal));
    same(
      citations.map((citation) => ({
        evidenceId: citation.evidenceId,
        ordinal: citation.ordinal,
      })),
      binding.citations.map((citation, ordinal) => ({
        evidenceId: citation.evidenceId,
        ordinal,
      })),
    );
    for (const citation of binding.citations) {
      const actual = await records.getEvidence(citation.evidenceId);
      if (!actual || actual.projectId !== scope) invalid();
      same(
        {
          evidenceId: actual.id,
          sourceKind: actual.sourceKind,
          sourceId: actual.sourceId,
          sourceVersion: actual.sourceVersion,
          contentDigest: actual.contentDigest,
          selection: "whole_source",
        },
        citation,
      );
    }
    return detail;
  };
  const port: FoundationFindingProposalRecords = {
    ...records,
    async insertFindingProposal(raw) {
      access("finding.propose", null, "machine");
      if (context.mode !== "machine") forbidden();
      const detail = foundationFindingProposalDetailSchema.parse(raw);
      const { capture: source, suggestion, decision } = detail;
      const binding = suggestion.proposal.binding;
      if (
        binding.projectId !== scope ||
        binding.environment !== request.environment ||
        binding.clientId !== context.request.clientId ||
        binding.principalId !== context.request.principalId ||
        binding.correlationId !== request.correlationId ||
        source.state !== "unfiled" ||
        decision !== null ||
        binding.sourceDigest !== foundationByteDigest(source.originalContent) ||
        binding.citationsDigest !== foundationDigest(binding.citations) ||
        suggestion.proposal.contentDigest !== foundationDigest(binding) ||
        source.createdAt !== new Date(source.createdAt).toISOString() ||
        new Date(source.createdAt).getTime() > now().getTime()
      )
        invalid();
      await validateCitations(binding.citations);
      await tx.insert(capture).values({
        id: source.id,
        inputType: "text",
        originalContent: source.originalContent,
        source: "foundation-client",
        author: context.request.principalId,
        projectId: scope,
        state: "unfiled",
        createdAt: new Date(source.createdAt),
      });
      await tx.insert(captureTriageSuggestion).values({
        id: suggestion.id,
        captureId: source.id,
        kind: "note",
        proposedProjectId: scope,
        title: suggestion.title,
        confidence: null,
        body: suggestion.body,
        proposal: suggestion.proposal,
        rationale: suggestion.rationale,
        ruleVersion: "agent-finding-proposal/v1",
        sourceLabel: "Agent finding proposal",
        createdAt: new Date(suggestion.createdAt),
      });
      await tx.insert(foundationFindingProposal).values({
        proposalId: suggestion.id,
        captureId: source.id,
        projectId: scope,
        environment: request.environment,
      });
      await tx.insert(foundationFindingCitation).values(
        binding.citations.map((citation, ordinal) => ({
          proposalId: suggestion.id,
          projectId: scope,
          evidenceId: citation.evidenceId,
          ordinal,
        })),
      );
      const inserted = await load({ proposalId: suggestion.id }, false);
      if (!inserted) invalid();
      same(inserted, detail);
      return inserted;
    },
    async getFindingProposal(proposalId, lock) {
      if (lock) access("finding.review", proposalId, "owner");
      else access("finding.read", proposalId);
      return load({ proposalId }, lock);
    },
    async getFindingProposalByCapture(captureId) {
      access("finding.read", captureId, "owner");
      return load({ captureId }, false);
    },
    async reviewFindingProposal({ decision: raw, memoryId, anchorEvidenceId }) {
      const decision = foundationFindingProposalDecisionSchema.parse(raw);
      access("finding.review", decision.suggestionId, "owner");
      if (context.mode !== "owner" || !request.principalId.startsWith("user:"))
        forbidden();
      const current = await load({ proposalId: decision.suggestionId }, true);
      if (!current)
        throw new FoundationError("NOT_FOUND", "Finding proposal not found");
      if (current.decision || current.capture.state !== "unfiled")
        throw new FoundationError(
          "VERSION_CONFLICT",
          "Finding review is stale",
        );
      const binding = current.suggestion.proposal.binding;
      const provenance = decision.provenance;
      if (
        decision.captureId !== current.capture.id ||
        decision.actor !== request.principalId ||
        provenance.reviewedBy !== request.principalId ||
        provenance.projectId !== scope ||
        provenance.environment !== request.environment ||
        provenance.correlationId !== request.correlationId ||
        provenance.proposalVersion !== binding.proposalVersion ||
        provenance.proposalDigest !==
          current.suggestion.proposal.contentDigest ||
        provenance.sourceDigest !== binding.sourceDigest ||
        provenance.citationsDigest !== binding.citationsDigest ||
        decision.createdAt !== new Date(decision.createdAt).toISOString() ||
        new Date(decision.createdAt).getTime() > now().getTime()
      )
        invalid();
      let knowledge = null;
      let memory = null;
      if (decision.decision === "approve") {
        if (
          !decision.filedRecordId ||
          decision.selectedProjectId !== scope ||
          decision.selectedKind !== "note" ||
          decision.selectedTitle === null ||
          decision.selectedBody === null ||
          binding.citations.some(
            (value) => value.evidenceId === anchorEvidenceId,
          )
        )
          invalid();
        await validateCitations(binding.citations);
        const filed = await fileCaptureNoteInTransaction(tx, {
          captureId: current.capture.id,
          recordId: decision.filedRecordId,
          projectId: scope,
          title: decision.selectedTitle,
          content: decision.selectedBody,
          at: new Date(decision.createdAt),
        });
        knowledge = {
          id: filed.record.id,
          projectId: scope,
          sourceCaptureId: current.capture.id,
          kind: "note" as const,
          title: filed.record.title,
          content: filed.record.content,
          version: 1 as const,
          createdAt: filed.record.createdAt.toISOString(),
          updatedAt: filed.record.updatedAt.toISOString(),
        };
        await records.insertEvidence({
          schemaVersion: 1,
          id: anchorEvidenceId,
          projectId: scope,
          sourceKind: "knowledge_revision",
          sourceId: decision.filedRecordId,
          sourceVersion: "1",
          contentDigest: foundationByteDigest(decision.selectedBody),
          locator:
            "commandry:knowledge:" + decision.filedRecordId + ":revision:1",
          observedAt: null,
          availability: "available",
          ingestedAt: decision.createdAt,
          recordedBy: request.principalId,
          verification: "unverified",
        });
        const content = {
          statement: decision.selectedBody,
          category: "finding" as const,
          evidenceIds: [
            anchorEvidenceId,
            ...binding.citations.map((value) => value.evidenceId),
          ],
          relatedMemoryIds: [],
          relationType: null,
        };
        const anchor = await records.resolveMemoryAnchor(
          decision.filedRecordId,
          content.evidenceIds,
        );
        memory = await records.saveMemory(
          {
            schemaVersion: 1,
            id: memoryId,
            projectId: scope,
            knowledgeItemId: decision.filedRecordId,
            version: 1,
            contentDigest: foundationDigest(content),
            content,
            lifecycle: "proposed",
            verification: "unverified",
            recordedBy: request.principalId,
            recordedAt: decision.createdAt,
          },
          null,
          null,
          anchor,
        );
      }
      await tx.insert(captureTriageDecision).values({
        ...decision,
        provenance: decision.provenance,
        createdAt: new Date(decision.createdAt),
      });
      if (knowledge && memory)
        await tx.insert(foundationFindingFiling).values({
          proposalId: decision.suggestionId,
          projectId: scope,
          captureId: current.capture.id,
          decisionId: decision.id,
          knowledgeId: knowledge.id,
          memoryId: memory.id,
          memoryVersion: 1,
          anchorEvidenceId,
        });
      return foundationFindingProposalReviewReceiptSchema.parse({
        schemaVersion: 1,
        proposalId: decision.suggestionId,
        captureId: current.capture.id,
        projectId: scope,
        environment: request.environment,
        decision,
        knowledge,
        memory,
      });
    },
  };
  return port;
}

export function createFoundationFindingProposalAccessRepository(
  db: CommandryDatabase,
  options: { now?: () => Date } = {},
): FoundationFindingProposalPort {
  return createFoundationWorkflowAccessRepository(
    db,
    createFoundationFindingProposalRecordRepository,
    {
      machineOperations: ["finding.read", "finding.propose"],
      ownerOperations: ["finding.read", "finding.review"],
      lockNamespace: "foundation-memory:",
      ...options,
    },
  );
}
