import { loadRuntimeConfig } from "@commandry/config";
import { entityIdSchema } from "@commandry/contracts";
import { localImagePreviewMediaType } from "@commandry/domain";
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
  if (!entityIdSchema.safeParse(id).success) {
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "A valid capture ID is required" },
      400,
      "capture_images.invalid_id",
    );
  }
  try {
    const original = await getFileCaptureService().getOriginal(id);
    const mediaType = localImagePreviewMediaType(
      original.mediaType,
      original.bytes,
    );
    if (!mediaType) {
      return jsonResponse(
        request,
        {
          code: "PREVIEW_UNSUPPORTED",
          message:
            "Only matching PNG, JPEG, WebP, and GIF originals can be previewed",
        },
        415,
        "capture_images.unsupported",
      );
    }
    return new Response(new Uint8Array(original.bytes), {
      status: 200,
      headers: {
        "content-type": mediaType,
        "content-length": String(original.byteSize),
        "content-disposition": "inline",
        "cache-control": "private, no-store",
        "content-security-policy": "default-src 'none'; sandbox",
        "cross-origin-resource-policy": "same-origin",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
        "x-commandry-sha256": original.sha256,
      },
    });
  } catch (error) {
    return fileCaptureFailure(request, error, "capture_images.read");
  }
}
