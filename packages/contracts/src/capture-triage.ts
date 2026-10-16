import { z } from "zod";

export const captureTriageSuggestionSchema = z.object({
  id: z.uuid(),
  captureId: z.uuid(),
  kind: z.enum(["task", "note"]),
  proposedProjectId: z.uuid().nullable(),
  title: z.string(),
  confidence: z.number().int().min(0).max(100),
  rationale: z.string(),
  ruleVersion: z.literal("capture-triage/v1"),
  sourceLabel: z.literal("Local deterministic rule"),
  createdAt: z.iso.datetime({ offset: true }),
});

export const captureTriageDecisionSchema = z.object({
  id: z.uuid(),
  captureId: z.uuid(),
  suggestionId: z.uuid(),
  decision: z.enum(["approve", "reject"]),
  selectedProjectId: z.uuid().nullable(),
  selectedKind: z.enum(["task", "note"]).nullable(),
  selectedTitle: z.string().nullable(),
  selectedBody: z.string().nullable(),
  filedRecordId: z.uuid().nullable(),
  actor: z.literal("local-user:unattributed"),
  createdAt: z.iso.datetime({ offset: true }),
});
