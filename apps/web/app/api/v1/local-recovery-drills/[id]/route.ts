import { loadRuntimeConfig } from "@commandry/config";
import { entityIdSchema, localRecoveryDrillSchema } from "@commandry/contracts";
import { jsonResponse } from "../../../../../lib/http";
import {
  getLocalRecoveryService,
  localRecoveryFailure,
} from "../../../../../lib/local-recovery";

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
      { code: "INVALID_ID", message: "A valid drill ID is required" },
      400,
      "local_recovery_drill.invalid_id",
    );
  try {
    const drill = await getLocalRecoveryService().getDrill(id);
    if (!drill)
      return jsonResponse(
        request,
        { code: "NOT_FOUND", message: "Local recovery drill not found" },
        404,
        "local_recovery_drill.not_found",
      );
    return jsonResponse(
      request,
      localRecoveryDrillSchema.parse(drill),
      200,
      "local_recovery_drill.get",
    );
  } catch {
    return localRecoveryFailure(request, "local_recovery_drill.get");
  }
}
