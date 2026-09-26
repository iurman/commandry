import { loadRuntimeConfig } from "@commandry/config";
import { z } from "zod";
import { jsonResponse } from "../../../../../lib/http";
import { runResponse } from "../../../../../lib/run-response";
import { getSyntheticRunService } from "../../../../../lib/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  loadRuntimeConfig();
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) {
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "A valid run ID is required" },
      400,
      "synthetic_run.invalid_id",
    );
  }
  try {
    const service = await getSyntheticRunService();
    const run = await service.getById(id);
    return run
      ? jsonResponse(request, runResponse(run), 200, "synthetic_run.read")
      : jsonResponse(
          request,
          { code: "NOT_FOUND", message: "Synthetic run not found" },
          404,
          "synthetic_run.not_found",
        );
  } catch {
    return jsonResponse(
      request,
      { code: "DATABASE_UNAVAILABLE", message: "Synthetic run is unavailable" },
      503,
      "synthetic_run.unavailable",
    );
  }
}
