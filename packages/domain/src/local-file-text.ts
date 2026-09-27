export const LOCAL_FILE_TEXT_EXTRACTOR = "local-utf8-v1";
export const LOCAL_FILE_TEXT_MAX_CHARACTERS = 200_000;

const readableMediaTypes = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
]);

const genericExtensions = /\.(txt|md|markdown|csv|json)$/iu;

export type LocalFileTextResult = {
  status: "extracted" | "unsupported" | "failed";
  text: string | null;
  truncated: boolean;
  message: string | null;
};

export function extractLocalFileText(input: {
  originalName: string;
  mediaType: string;
  bytes: Uint8Array;
}): LocalFileTextResult {
  const supported =
    readableMediaTypes.has(input.mediaType) ||
    (input.mediaType === "application/octet-stream" &&
      genericExtensions.test(input.originalName));
  if (!supported)
    return {
      status: "unsupported",
      text: null,
      truncated: false,
      message: "This file type has no local text extractor.",
    };

  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(
      input.bytes,
    );
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(decoded))
      throw new Error("File contains non-text control characters");
    const text = decoded.replace(/^\uFEFF/u, "");
    if (!text.trim()) throw new Error("File has no readable text");
    const truncated = text.length > LOCAL_FILE_TEXT_MAX_CHARACTERS;
    return {
      status: "extracted",
      text: truncated ? text.slice(0, LOCAL_FILE_TEXT_MAX_CHARACTERS) : text,
      truncated,
      message: null,
    };
  } catch {
    return {
      status: "failed",
      text: null,
      truncated: false,
      message: "The declared text file is not readable UTF-8 text.",
    };
  }
}
