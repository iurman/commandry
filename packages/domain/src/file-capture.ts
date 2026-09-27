export const LOCAL_FILE_CAPTURE_MAX_BYTES = 2_097_152;

export function localImagePreviewMediaType(
  declaredMediaType: string,
  bytes: Uint8Array,
): "image/png" | "image/jpeg" | "image/webp" | "image/gif" | null {
  const starts = (...signature: number[]) =>
    signature.every((byte, index) => bytes[index] === byte);
  if (
    declaredMediaType === "image/png" &&
    starts(137, 80, 78, 71, 13, 10, 26, 10)
  )
    return "image/png";
  if (declaredMediaType === "image/jpeg" && starts(255, 216, 255))
    return "image/jpeg";
  if (
    declaredMediaType === "image/webp" &&
    starts(82, 73, 70, 70) &&
    bytes[8] === 87 &&
    bytes[9] === 69 &&
    bytes[10] === 66 &&
    bytes[11] === 80
  )
    return "image/webp";
  if (
    declaredMediaType === "image/gif" &&
    starts(71, 73, 70, 56) &&
    (starts(71, 73, 70, 56, 55, 97) || starts(71, 73, 70, 56, 57, 97))
  )
    return "image/gif";
  return null;
}

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
