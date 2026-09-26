export interface CaptureRecord {
  id: string;
  inputType: "text" | "url";
  originalContent: string;
  source: string;
  author: string;
  state: "unfiled" | "filed";
  projectId: string | null;
  filedRecord: { kind: "task" | "note"; id: string } | null;
  createdAt: string;
  filedAt: string | null;
}

export interface FiledCaptureResponse {
  capture: CaptureRecord;
  record: { id: string; projectId: string; sourceCaptureId: string };
}
