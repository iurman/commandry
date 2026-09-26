import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  fileCaptureRequestSchema,
  fileCaptureResponseSchema,
} from "@commandry/contracts";
import {
  captureFailure,
  getCaptureService,
} from "../../../../../../lib/capture";
import { jsonResponse } from "../../../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
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
  const parsed = fileCaptureRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid filing request" },
      400,
      "captures.invalid_filing",
    );
  }
  try {
    const filed = await getCaptureService().fileCapture(id, parsed.data);
    return jsonResponse(
      request,
      fileCaptureResponseSchema.parse(filed),
      201,
      "captures.file",
    );
  } catch (error) {
    return captureFailure(request, error, "captures.file");
  }
}
