export interface CaptureRecord {
  id: string;
  inputType: "text" | "url";
  originalContent: string;
  source: string;
  author: string;
  state: "unfiled" | "filed";
  projectId: string | null;
  filedRecord: { kind: "task" | "note" | "link"; id: string } | null;
  createdAt: string;
  filedAt: string | null;
}

export interface FiledCaptureResponse {
  capture: CaptureRecord;
  record: { id: string; projectId: string; sourceCaptureId: string };
}

export interface CaptureTriageReview {
  suggestion: {
    id: string;
    captureId: string;
    kind: "task" | "note";
    proposedProjectId: string | null;
    title: string;
    confidence: number;
    rationale: string;
    ruleVersion: "capture-triage/v1";
    sourceLabel: "Local deterministic rule";
    createdAt: string;
  } | null;
  decision: {
    id: string;
    decision: "approve" | "reject";
    actor: "local-user:unattributed";
    createdAt: string;
    filedRecordId: string | null;
  } | null;
}
