import { loadRuntimeConfig } from "@commandry/config";
import { entityIdSchema } from "@commandry/contracts";
import {
  captureTriageFailure,
  getCaptureTriageService,
} from "../../../../../../lib/capture-triage";
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
      "capture_triage.invalid_id",
    );
  }
  try {
    await (await getCaptureTriageService()).requestSuggestion(id);
    return jsonResponse(
      request,
      { captureId: id, queued: true },
      202,
      "capture_triage.queued",
    );
  } catch (error) {
    return captureTriageFailure(request, error, "capture_triage.queue");
  }
}
