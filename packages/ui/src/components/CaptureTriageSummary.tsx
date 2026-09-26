import { Button } from "./Button";

export interface CaptureTriageSummaryView {
  suggestion: {
    kind: "task" | "note";
    title: string;
    confidence: number;
    rationale: string;
    sourceLabel: string;
    ruleVersion: string;
  };
  decision: {
    decision: "approve" | "reject";
    actor: string;
    createdAt: string;
  } | null;
}

export function CaptureTriageSummary({
  review,
  captureState,
  saving = false,
  onReject,
}: {
  review: CaptureTriageSummaryView;
  captureState: "filed" | "unfiled";
  saving?: boolean;
  onReject?: () => void;
}) {
  const { suggestion, decision } = review;
  return (
    <div className="cmd-triage-summary">
      <p className="cmd-triage-source">
        <strong>{suggestion.sourceLabel}</strong>
        <span>{suggestion.ruleVersion}</span>
      </p>
      <p className="cmd-triage-proposal">
        Suggested {suggestion.kind}: <strong>{suggestion.title}</strong>
      </p>
      <p>Rule confidence: {suggestion.confidence}%</p>
      <p>{suggestion.rationale}</p>
      {!decision && captureState === "unfiled" && (
        <p>
          Correct the project, type, title, or body in the form below, then
          approve the reviewed suggestion or reject it.
        </p>
      )}
      {decision && (
        <p>
          Reviewed as {decision.decision} by {decision.actor} at{" "}
          <time dateTime={decision.createdAt}>{decision.createdAt}</time>.
        </p>
      )}
      {!decision && captureState === "unfiled" && onReject && (
        <Button disabled={saving} onClick={onReject} type="button">
          {saving ? "Saving review..." : "Reject suggestion"}
        </Button>
      )}
    </div>
  );
}
