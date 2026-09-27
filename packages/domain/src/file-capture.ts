export const LOCAL_FILE_CAPTURE_MAX_BYTES = 2_097_152;

export class FileCaptureError extends Error {
  constructor(
    public readonly code:
      "FILE_INVALID" | "FILE_TOO_LARGE" | "FILE_NOT_FOUND" | "FILE_CORRUPT",
    message: string,
  ) {
    super(message);
    this.name = "FileCaptureError";
  }
}

export function validateLocalFileCapture(input: {
  originalName: string;
  mediaType: string;
  byteSize: number;
}) {
  if (input.byteSize > LOCAL_FILE_CAPTURE_MAX_BYTES)
    throw new FileCaptureError(
      "FILE_TOO_LARGE",
      "The local file limit is 2 MiB",
    );
  if (
    input.byteSize < 1 ||
    input.originalName.length < 1 ||
    input.originalName.length > 255 ||
    /[\\/\x00-\x1f\x7f]/u.test(input.originalName) ||
    input.originalName === "." ||
    input.originalName === ".." ||
    input.mediaType.length > 160
  ) {
    throw new FileCaptureError(
      "FILE_INVALID",
      "Invalid local file metadata or empty file",
    );
  }
  return {
    originalName: input.originalName,
    mediaType: /^[\w.+-]+\/[\w.+-]+$/u.test(input.mediaType)
      ? input.mediaType
      : "application/octet-stream",
  };
}
