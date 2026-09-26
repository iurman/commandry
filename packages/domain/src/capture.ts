export type ManualCaptureInputType = "text" | "url";

export const MANUAL_CAPTURE_SOURCE = "manual-local" as const;
export const MANUAL_CAPTURE_AUTHOR = "local-user" as const;

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
      "CAPTURE_NOT_FOUND" | "PROJECT_NOT_FOUND" | "CAPTURE_ALREADY_FILED",
    message: string,
  ) {
    super(message);
  }
}
