import { loadRuntimeConfig } from "@commandry/config";
import { entityIdSchema } from "@commandry/contracts";
import {
  fileCaptureFailure,
  getFileCaptureService,
} from "../../../../../../lib/file-capture";
import { jsonResponse } from "../../../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  loadRuntimeConfig();
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success)
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "A valid capture ID is required" },
      400,
      "capture_files.invalid_id",
    );
  try {
    const original = await getFileCaptureService().getOriginal(id);
    return new Response(new Uint8Array(original.bytes), {
      status: 200,
      headers: {
        "content-type": "application/octet-stream",
        "content-disposition": `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(original.originalName)}`,
        "content-length": String(original.byteSize),
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "x-commandry-sha256": original.sha256,
      },
    });
  } catch (error) {
    return fileCaptureFailure(request, error, "capture_files.read");
  }
}
