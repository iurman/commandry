import { and, eq } from "drizzle-orm";
import type {
  KnowledgeItem,
  ReviewCaptureTriageRequest,
  WorkItem,
} from "@commandry/contracts";
import {
  CAPTURE_TRIAGE_RULE_VERSION,
  CAPTURE_TRIAGE_SOURCE_LABEL,
  CaptureTriageError,
  requireCaptureTriageReview,
} from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import {
  capture,
  captureTriageDecision,
  captureTriageSuggestion,
  knowledgeItem,
  project,
  workItem,
} from "./schema";

function captureRecord(row: typeof capture.$inferSelect) {
  return {
    id: row.id,
    inputType: row.inputType,
    originalContent: row.originalContent,
    source: "manual-local" as const,
    author: "local-user" as const,
    state: row.state,
    projectId: row.projectId,
    filedRecord:
      row.filedRecordKind && row.filedRecordId
        ? { kind: row.filedRecordKind, id: row.filedRecordId }
        : null,
    createdAt: row.createdAt.toISOString(),
    filedAt: row.filedAt?.toISOString() ?? null,
  };
}

function suggestionRecord(row: typeof captureTriageSuggestion.$inferSelect) {
  return {
    id: row.id,
    captureId: row.captureId,
    kind: row.kind,
    proposedProjectId: row.proposedProjectId,
    title: row.title,
    confidence: row.confidence,
    rationale: row.rationale,
    ruleVersion: CAPTURE_TRIAGE_RULE_VERSION,
    sourceLabel: CAPTURE_TRIAGE_SOURCE_LABEL,
    createdAt: row.createdAt.toISOString(),
  };
}

function decisionRecord(row: typeof captureTriageDecision.$inferSelect) {
  return {
    id: row.id,
    captureId: row.captureId,
    suggestionId: row.suggestionId,
    decision: row.decision,
    selectedProjectId: row.selectedProjectId,
    selectedKind: row.selectedKind,
    selectedTitle: row.selectedTitle,
    selectedBody: row.selectedBody,
    filedRecordId: row.filedRecordId,
    actor: "local-user:unattributed" as const,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createCaptureTriageRepository(db: CommandryDatabase) {
  return {
    async getCapture(id: string) {
      const [row] = await db
        .select({
          id: capture.id,
          inputType: capture.inputType,
          originalContent: capture.originalContent,
          state: capture.state,
          projectId: capture.projectId,
        })
        .from(capture)
        .where(eq(capture.id, id))
        .limit(1);
      return row ?? null;
    },
    async getReview(captureId: string) {
      const [suggestion] = await db
        .select()
        .from(captureTriageSuggestion)
        .where(eq(captureTriageSuggestion.captureId, captureId))
        .limit(1);
      const [decision] = await db
        .select()
        .from(captureTriageDecision)
        .where(eq(captureTriageDecision.captureId, captureId))
        .limit(1);
      return {
        suggestion: suggestion ? suggestionRecord(suggestion) : null,
        decision: decision ? decisionRecord(decision) : null,
      };
    },
    async createSuggestionOnce(input: {
      captureId: string;
      kind: "task" | "note";
      proposedProjectId: string | null;
      title: string;
      confidence: number;
      rationale: string;
    }) {
      const row = await db.transaction(async (tx) => {
        const [source] = await tx
          .select({ state: capture.state, projectId: capture.projectId })
          .from(capture)
          .where(eq(capture.id, input.captureId))
          .for("share")
          .limit(1);
        if (!source) {
          throw new CaptureTriageError(
            "CAPTURE_NOT_FOUND",
            "Capture not found",
          );
        }
        if (source.state === "filed") return null;
        const [inserted] = await tx
          .insert(captureTriageSuggestion)
          .values({
            id: crypto.randomUUID(),
            captureId: input.captureId,
            kind: input.kind,
            proposedProjectId: source.projectId,
            title: input.title,
            confidence: input.confidence,
            rationale: input.rationale,
            ruleVersion: CAPTURE_TRIAGE_RULE_VERSION,
            sourceLabel: CAPTURE_TRIAGE_SOURCE_LABEL,
          })
          .onConflictDoNothing({ target: captureTriageSuggestion.captureId })
          .returning();
        if (inserted) return inserted;
        const [existing] = await tx
          .select()
          .from(captureTriageSuggestion)
          .where(eq(captureTriageSuggestion.captureId, input.captureId))
          .limit(1);
        if (!existing) throw new Error("Suggestion conflict disappeared");
        return existing;
      });
      return row ? suggestionRecord(row) : null;
    },
    async review(captureId: string, input: ReviewCaptureTriageRequest) {
      return db.transaction(async (tx) => {
        const [source] = await tx
          .select()
          .from(capture)
          .where(eq(capture.id, captureId))
          .for("update")
          .limit(1);
        if (!source) {
          throw new CaptureTriageError(
            "CAPTURE_NOT_FOUND",
            "Capture not found",
          );
        }
        const [suggestion] = await tx
          .select()
          .from(captureTriageSuggestion)
          .where(eq(captureTriageSuggestion.captureId, captureId))
          .limit(1);
        const [existingDecision] = await tx
          .select({ id: captureTriageDecision.id })
          .from(captureTriageDecision)
          .where(eq(captureTriageDecision.captureId, captureId))
          .limit(1);
        requireCaptureTriageReview({
          captureState: source.state,
          suggestionExists: Boolean(suggestion),
          decisionExists: Boolean(existingDecision),
        });
        if (!suggestion) throw new Error("Reviewed suggestion disappeared");
        const now = new Date();
        let updatedCapture = source;
        let record: WorkItem | KnowledgeItem | null = null;
        let filedRecordId: string | null = null;
        let selectedBody: string | null = null;
        if (input.decision === "approve") {
          const [targetProject] = await tx
            .select({ id: project.id })
            .from(project)
            .where(eq(project.id, input.projectId))
            .limit(1);
          if (!targetProject) {
            throw new CaptureTriageError(
              "PROJECT_NOT_FOUND",
              "Project not found",
            );
          }
          filedRecordId = crypto.randomUUID();
          selectedBody = input.body ?? source.originalContent;
          const [updated] = await tx
            .update(capture)
            .set({
              state: "filed",
              projectId: input.projectId,
              filedRecordKind: input.kind,
              filedRecordId,
              filedAt: now,
            })
            .where(and(eq(capture.id, captureId), eq(capture.state, "unfiled")))
            .returning();
          if (!updated) {
            throw new CaptureTriageError(
              "CAPTURE_ALREADY_FILED",
              "Capture is already filed",
            );
          }
          updatedCapture = updated;
          if (input.kind === "task") {
            const [item] = await tx
              .insert(workItem)
              .values({
                id: filedRecordId,
                projectId: input.projectId,
                sourceCaptureId: captureId,
                title: input.title,
                description: selectedBody,
              })
              .returning();
            if (!item) throw new Error("Task filing returned no row");
            record = {
              id: item.id,
              projectId: item.projectId,
              sourceCaptureId: item.sourceCaptureId,
              title: item.title,
              description: item.description,
              status: item.status,
              createdAt: item.createdAt.toISOString(),
              updatedAt: item.updatedAt.toISOString(),
            };
          } else {
            const [item] = await tx
              .insert(knowledgeItem)
              .values({
                id: filedRecordId,
                projectId: input.projectId,
                sourceCaptureId: captureId,
                kind: "note",
                title: input.title,
                content: selectedBody,
              })
              .returning();
            if (!item) throw new Error("Note filing returned no row");
            record = {
              id: item.id,
              projectId: item.projectId,
              sourceCaptureId: item.sourceCaptureId,
              kind: "note",
              title: item.title,
              content: item.content,
              version: item.version,
              createdAt: item.createdAt.toISOString(),
              updatedAt: item.updatedAt.toISOString(),
            };
          }
        }
        const [decision] = await tx
          .insert(captureTriageDecision)
          .values({
            id: crypto.randomUUID(),
            captureId,
            suggestionId: suggestion.id,
            decision: input.decision,
            selectedProjectId:
              input.decision === "approve" ? input.projectId : null,
            selectedKind: input.decision === "approve" ? input.kind : null,
            selectedTitle: input.decision === "approve" ? input.title : null,
            selectedBody,
            filedRecordId,
            actor: "local-user:unattributed",
            createdAt: now,
          })
          .returning();
        if (!decision) throw new Error("Triage decision returned no row");
        return {
          capture: captureRecord(updatedCapture),
          suggestion: suggestionRecord(suggestion),
          decision: decisionRecord(decision),
          record,
        };
      });
    },
  };
}
