import { createHash } from "node:crypto";
import type { LocalFileTextProjection } from "@commandry/contracts";
import {
  extractLocalFileText,
  LOCAL_FILE_TEXT_EXTRACTOR,
} from "@commandry/domain";

export interface LocalFileTextPort {
  get(captureId: string): Promise<LocalFileTextProjection | null>;
  getSource(captureId: string): Promise<{
    originalName: string;
    mediaType: string;
    byteSize: number;
    sha256: string;
    contentBase64: string;
  } | null>;
  complete(input: {
    captureId: string;
    sourceSha256: string;
    status: "extracted" | "unsupported" | "failed";
    extractedText: string | null;
    truncated: boolean;
    message: string | null;
  }): Promise<LocalFileTextProjection>;
}

export function createLocalFileTextService(port: LocalFileTextPort) {
  return {
    get: port.get,
    async process(captureId: string) {
      const existing = await port.get(captureId);
      if (!existing) throw new Error("File text projection not found");
      if (existing.status !== "pending") return existing;
      const source = await port.getSource(captureId);
      if (!source) throw new Error("Original file not found");
      const bytes = Buffer.from(source.contentBase64, "base64");
      const checksum = createHash("sha256").update(bytes).digest("hex");
      const result =
        bytes.byteLength === source.byteSize &&
        checksum === source.sha256 &&
        checksum === existing.sourceSha256
          ? extractLocalFileText({
              originalName: source.originalName,
              mediaType: source.mediaType,
              bytes,
            })
          : {
              status: "failed" as const,
              text: null,
              truncated: false,
              message: "Original file integrity check failed.",
            };
      if (existing.extractor !== LOCAL_FILE_TEXT_EXTRACTOR)
        throw new Error("Unsupported file text extractor version");
      return port.complete({
        captureId,
        sourceSha256: existing.sourceSha256,
        status: result.status,
        extractedText: result.text,
        truncated: result.truncated,
        message: result.message,
      });
    },
  };
}
