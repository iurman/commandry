import type {
  Capture,
  CreateCaptureRequest,
  CaptureTriageReview,
  CaptureTriageSuggestion,
  ReviewCaptureTriageRequest,
  ReviewCaptureTriageResponse,
} from "@commandry/contracts";
import { CaptureTriageError, suggestCaptureTriage } from "@commandry/domain";

export interface CaptureTriagePort {
  getCapture(id: string): Promise<{
    id: string;
    inputType: "text" | "url";
    originalContent: string;
    state: "unfiled" | "filed";
    projectId: string | null;
  } | null>;
  getReview(captureId: string): Promise<CaptureTriageReview>;
  createSuggestionOnce(input: {
    captureId: string;
    kind: "task" | "note";
    proposedProjectId: string | null;
    title: string;
    confidence: number;
    rationale: string;
  }): Promise<CaptureTriageSuggestion | null>;
  review(
    captureId: string,
    input: ReviewCaptureTriageRequest,
  ): Promise<ReviewCaptureTriageResponse>;
  enqueueSuggestion(captureId: string): Promise<void>;
}

export function createCaptureTriageService(port: CaptureTriagePort) {
  return {
    async getReview(captureId: string) {
      const capture = await port.getCapture(captureId);
      if (!capture) {
        throw new CaptureTriageError("CAPTURE_NOT_FOUND", "Capture not found");
      }
      return port.getReview(captureId);
    },
    async requestSuggestion(captureId: string) {
      const capture = await port.getCapture(captureId);
      if (!capture) {
        throw new CaptureTriageError("CAPTURE_NOT_FOUND", "Capture not found");
      }
      if (capture.state === "filed") {
        throw new CaptureTriageError(
          "CAPTURE_ALREADY_FILED",
          "Capture is already filed",
        );
      }
      await port.enqueueSuggestion(captureId);
    },
    review: port.review,
  };
}

export async function createCaptureAndRequestTriage(
  createCapture: (input: CreateCaptureRequest) => Promise<Capture>,
  requestSuggestion: (captureId: string) => Promise<void>,
  input: CreateCaptureRequest,
): Promise<{ capture: Capture; triageQueued: boolean }> {
  const capture = await createCapture(input);
  try {
    await requestSuggestion(capture.id);
    return { capture, triageQueued: true };
  } catch {
    // The immutable original remains in the Inbox if enrichment is unavailable.
    return { capture, triageQueued: false };
  }
}

export function createCaptureTriageProcessor(
  port: Pick<CaptureTriagePort, "getCapture" | "createSuggestionOnce">,
) {
  return async (captureId: string) => {
    const capture = await port.getCapture(captureId);
    if (!capture) {
      throw new CaptureTriageError("CAPTURE_NOT_FOUND", "Capture not found");
    }
    if (capture.state === "filed") return null;
    const proposal = suggestCaptureTriage(capture);
    return port.createSuggestionOnce({
      captureId,
      proposedProjectId: capture.projectId,
      ...proposal,
    });
  };
}
