import { loadRuntimeConfig } from "@commandry/config";
import { captureSchema } from "@commandry/contracts";
import {
  FileCaptureError,
  LOCAL_FILE_CAPTURE_MAX_BYTES,
} from "@commandry/domain";
import {
  fileCaptureFailure,
  getFileCaptureService,
} from "../../../../../lib/file-capture";
import { jsonResponse } from "../../../../../lib/http";
import { enqueueLocalFileText } from "../../../../../lib/local-file-text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const maximumMultipartBytes = LOCAL_FILE_CAPTURE_MAX_BYTES + 65_536;

export async function POST(request: Request): Promise<Response> {
  loadRuntimeConfig();
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > maximumMultipartBytes)
    return fileCaptureFailure(
      request,
      new FileCaptureError("FILE_TOO_LARGE", "The local file limit is 2 MiB"),
      "capture_files.create",
    );
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > maximumMultipartBytes) {
        await reader.cancel();
        return fileCaptureFailure(
          request,
          new FileCaptureError(
            "FILE_TOO_LARGE",
            "The local file limit is 2 MiB",
          ),
          "capture_files.create",
        );
      }
      chunks.push(value);
    }
  }
  const form = await new Request(request.url, {
    method: "POST",
    headers: { "content-type": request.headers.get("content-type") ?? "" },
    body: Buffer.concat(chunks),
  })
    .formData()
    .catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File))
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "A file is required" },
      400,
      "capture_files.invalid_body",
    );
  if (file.size > LOCAL_FILE_CAPTURE_MAX_BYTES)
    return fileCaptureFailure(
      request,
      new FileCaptureError("FILE_TOO_LARGE", "The local file limit is 2 MiB"),
      "capture_files.create",
    );
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const saved = await getFileCaptureService().create({
      originalName: file.name,
      mediaType: file.type,
      bytes,
    });
    let extractionQueued = false;
    try {
      await enqueueLocalFileText(saved.id);
      extractionQueued = true;
    } catch {
      // The pending projection is reconciled by the worker after queue recovery.
    }
    return jsonResponse(
      request,
      captureSchema.parse(saved),
      201,
      extractionQueued
        ? "capture_files.created"
        : "capture_files.created.extraction_pending",
    );
  } catch (error) {
    return fileCaptureFailure(request, error, "capture_files.create");
  }
}
