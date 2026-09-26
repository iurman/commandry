import { loadRuntimeConfig } from "@commandry/config";
import { captureSchema, entityIdSchema } from "@commandry/contracts";
import { captureFailure, getCaptureService } from "../../../../../lib/capture";
import { jsonResponse } from "../../../../../lib/http";

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
      "captures.invalid_id",
    );
  }
  try {
    const item = await getCaptureService().getCapture(id);
    return item
      ? jsonResponse(request, captureSchema.parse(item), 200, "captures.read")
      : jsonResponse(
          request,
          { code: "NOT_FOUND", message: "Capture not found" },
          404,
          "captures.not_found",
        );
  } catch (error) {
    return captureFailure(request, error, "captures.read");
  }
}
