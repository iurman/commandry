import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import type { Capture } from "@commandry/contracts";
import { createFileCaptureService, type FileCapturePort } from "./file-capture";

test("file capture preserves exact bytes and verifies them before download", async () => {
  const bytes = Uint8Array.from([0, 1, 13, 10, 255, 128]);
  const digest = createHash("sha256").update(bytes).digest("hex");
  const holder: {
    saved: Awaited<ReturnType<FileCapturePort["getOriginal"]>>;
  } = { saved: null };
  const port: FileCapturePort = {
    async create(input) {
      holder.saved = input;
      return {
        id: input.captureId,
        inputType: "file",
        originalContent: `capture-file://${input.captureId}`,
        file: {
          originalName: input.originalName,
          mediaType: input.mediaType,
          byteSize: input.byteSize,
          sha256: input.sha256,
          downloadHref: `/api/v1/captures/${input.captureId}/original-file`,
        },
        source: "manual-local",
        author: "local-user",
        state: "unfiled",
        projectId: null,
        filedRecord: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        filedAt: null,
      } satisfies Capture;
    },
    async getOriginal() {
      return holder.saved;
    },
  };
  const service = createFileCaptureService(port);
  const capture = await service.create({
    originalName: "bytes.bin",
    mediaType: "application/octet-stream",
    bytes,
  });
  expect(capture.file?.sha256).toBe(digest);
  expect(holder.saved?.contentBase64).toBe(
    Buffer.from(bytes).toString("base64"),
  );
  expect(Array.from((await service.getOriginal(capture.id)).bytes)).toEqual(
    Array.from(bytes),
  );

  holder.saved = {
    ...holder.saved!,
    contentBase64: Buffer.from("different").toString("base64"),
  };
  await expect(service.getOriginal(capture.id)).rejects.toMatchObject({
    code: "FILE_CORRUPT",
  });
});
