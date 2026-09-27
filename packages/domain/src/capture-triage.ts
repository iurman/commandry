export const CAPTURE_TRIAGE_RULE_VERSION = "capture-triage/v1" as const;
export const CAPTURE_TRIAGE_SOURCE_LABEL = "Local deterministic rule" as const;

export type CaptureTriageKind = "task" | "note";

export class CaptureTriageError extends Error {
  constructor(
    public readonly code:
      | "CAPTURE_NOT_FOUND"
      | "SUGGESTION_NOT_READY"
      | "CAPTURE_ALREADY_FILED"
      | "CAPTURE_UNSUPPORTED"
      | "TRIAGE_ALREADY_REVIEWED"
      | "PROJECT_NOT_FOUND",
    message: string,
  ) {
    super(message);
  }
}

export function suggestCaptureTriage(input: {
  inputType: ManualCaptureInputType;
  originalContent: string;
}): {
  kind: CaptureTriageKind;
  title: string;
  confidence: number;
  rationale: string;
} {
  if (input.inputType === "url") {
    const host = new URL(input.originalContent).hostname;
    return {
      kind: "note",
      title: `Saved link: ${host}`.slice(0, 200),
      confidence: 70,
      rationale:
        "A URL is suggested as a reference note by a fixed local rule. Review the project and title before filing.",
    };
  }
  const actionable =
    /\b(todo|fix|need to|follow up|review|implement|ship)\b/i.test(
      input.originalContent,
    );
  const sourceDescription = {
    text: "text",
    email: "pasted email",
    conversation: "pasted conversation",
    voice_transcript: "entered voice transcript",
  }[input.inputType];
  return actionable
    ? {
        kind: "task",
        title: "Review captured action",
        confidence: 60,
        rationale: `Action words in this ${sourceDescription} triggered a fixed local task suggestion. It may be wrong; review before filing.`,
      }
    : {
        kind: "note",
        title: "Review captured thought",
        confidence: 50,
        rationale:
          input.inputType === "text"
            ? "No action words matched the fixed local rule, so this is suggested as a note. Review before filing."
            : `No action words in this ${sourceDescription} matched the fixed local rule, so it is suggested as a note. Review before filing.`,
      };
}

export function requireCaptureTriageReview(input: {
  captureState: "unfiled" | "filed";
  suggestionExists: boolean;
  decisionExists: boolean;
}): void {
  if (input.captureState === "filed") {
    throw new CaptureTriageError(
      "CAPTURE_ALREADY_FILED",
      "Capture is already filed",
    );
  }
  if (!input.suggestionExists) {
    throw new CaptureTriageError(
      "SUGGESTION_NOT_READY",
      "Suggestion is not ready yet",
    );
  }
  if (input.decisionExists) {
    throw new CaptureTriageError(
      "TRIAGE_ALREADY_REVIEWED",
      "Suggestion was already reviewed",
    );
  }
}
import type { ManualCaptureInputType } from "./capture";
