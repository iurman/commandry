import { loadRuntimeConfig } from "@commandry/config";
import { createSyntheticRunRequestSchema } from "@commandry/contracts";
import { jsonResponse } from "../../../../lib/http";
import { runResponse } from "../../../../lib/run-response";
import { getSyntheticRunService } from "../../../../lib/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  loadRuntimeConfig();
  const body: unknown = await request.json().catch(() => null);
  const parsed = createSyntheticRunRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "A valid idempotencyKey is required" },
      400,
      "synthetic_run.invalid_body",
    );
  }
  try {
    const service = await getSyntheticRunService();
    const run = await service.submit(parsed.data.idempotencyKey);
    return jsonResponse(
      request,
      runResponse(run),
      202,
      "synthetic_run.submitted",
    );
  } catch {
    return jsonResponse(
      request,
      {
        code: "SUBMISSION_FAILED",
        message: "Synthetic run could not be queued",
      },
      503,
      "synthetic_run.submission_failed",
    );
  }
}
