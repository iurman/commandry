export const MANUAL_TEXT_CAPTURE_INPUT_TYPES = [
  "text",
  "email",
  "conversation",
  "voice_transcript",
] as const;
export type ManualTextCaptureInputType =
  (typeof MANUAL_TEXT_CAPTURE_INPUT_TYPES)[number];
export type ManualCaptureInputType = ManualTextCaptureInputType | "url";

export const MANUAL_CAPTURE_SOURCE = "manual-local" as const;
export const MANUAL_CAPTURE_AUTHOR = "local-user" as const;

export const KNOWLEDGE_TEXT_TYPES = [
  "note",
  "idea",
  "research",
  "requirement",
  "architecture_note",
  "runbook",
  "meeting_note",
  "lesson_learned",
  "instruction",
] as const;
export type KnowledgeTextType = (typeof KNOWLEDGE_TEXT_TYPES)[number];

export function knowledgeKindLabel(
  kind: KnowledgeTextType | "link" | "document",
): string {
  return {
    note: "Note",
    idea: "Idea",
    research: "Research",
    requirement: "Requirement",
    architecture_note: "Architecture note",
    runbook: "Runbook",
    meeting_note: "Meeting note",
    lesson_learned: "Lesson learned",
    instruction: "Instruction",
    link: "Link",
    document: "Document",
  }[kind];
}

export function validateKnowledgeFilingType(
  kind: "task" | "note" | "link" | "document",
  knowledgeType: KnowledgeTextType | undefined,
): KnowledgeTextType {
  if (knowledgeType && kind !== "note") {
    throw new CaptureError(
      "CAPTURE_KIND_INVALID",
      "Only a text Knowledge capture may select a Knowledge type",
    );
  }
  return knowledgeType ?? "note";
}

export function validateWorkFilingType(
  kind: "task" | "note" | "link" | "document",
  workType: "task" | "initiative" | undefined,
): "task" | "initiative" {
  if (workType && kind !== "task") {
    throw new CaptureError(
      "CAPTURE_KIND_INVALID",
      "Only a Work capture may select a Work type",
    );
  }
  return workType ?? "task";
}

export function validateOriginalCaptureContent(
  inputType: ManualCaptureInputType,
  originalContent: string,
): void {
  if (originalContent.trim().length === 0) {
    throw new Error("Capture content must not be empty");
  }
  if (inputType === "url") {
    if (originalContent !== originalContent.trim()) {
      throw new Error("A capture URL must not have surrounding whitespace");
    }
    let url: URL;
    try {
      url = new URL(originalContent);
    } catch {
      throw new Error("Capture URL is invalid");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Capture URL must use HTTP or HTTPS");
    }
  }
}

export function manualFilingContent(
  originalContent: string,
  suppliedBody: string | undefined,
): string {
  return suppliedBody ?? originalContent;
}

export class CaptureError extends Error {
  constructor(
    public readonly code:
      | "CAPTURE_NOT_FOUND"
      | "PROJECT_NOT_FOUND"
      | "CAPTURE_ALREADY_FILED"
      | "CAPTURE_KIND_INVALID",
    message: string,
  ) {
    super(message);
  }
}
