import { createHash } from "node:crypto";
import type { Capture } from "@commandry/contracts";
import { FileCaptureError, validateLocalFileCapture } from "@commandry/domain";

export interface FileCapturePort {
  create(input: {
    captureId: string;
    originalName: string;
    mediaType: string;
    byteSize: number;
    sha256: string;
    contentBase64: string;
  }): Promise<Capture>;
  getOriginal(id: string): Promise<{
    originalName: string;
    mediaType: string;
    byteSize: number;
    sha256: string;
    contentBase64: string;
  } | null>;
}

export function createFileCaptureService(port: FileCapturePort) {
  return {
    async create(input: {
      originalName: string;
      mediaType: string;
      bytes: Uint8Array;
    }) {
      const metadata = validateLocalFileCapture({
        originalName: input.originalName,
        mediaType: input.mediaType,
        byteSize: input.bytes.byteLength,
      });
      const sha256 = createHash("sha256").update(input.bytes).digest("hex");
      return port.create({
        captureId: crypto.randomUUID(),
        ...metadata,
        byteSize: input.bytes.byteLength,
        sha256,
        contentBase64: Buffer.from(input.bytes).toString("base64"),
      });
    },
    async getOriginal(id: string) {
      const record = await port.getOriginal(id);
      if (!record)
        throw new FileCaptureError("FILE_NOT_FOUND", "Original file not found");
      const bytes = Buffer.from(record.contentBase64, "base64");
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      if (bytes.byteLength !== record.byteSize || sha256 !== record.sha256)
        throw new FileCaptureError(
          "FILE_CORRUPT",
          "Original file integrity check failed",
        );
      return { ...record, bytes };
    },
  };
}
