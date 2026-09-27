import { loadRuntimeConfig } from "@commandry/config";
import {
  listLocalRecoveryDrillsQuerySchema,
  listLocalRecoveryDrillsResponseSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../lib/http";
import {
  getLocalRecoveryService,
  localRecoveryFailure,
} from "../../../../lib/local-recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  loadRuntimeConfig();
  const query = listLocalRecoveryDrillsQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid recovery history query" },
      400,
      "local_recovery_drills.invalid_query",
    );
  try {
    const page = await getLocalRecoveryService().listDrills(query.data);
    return jsonResponse(
      request,
      listLocalRecoveryDrillsResponseSchema.parse(page),
      200,
      "local_recovery_drills.list",
    );
  } catch {
    return localRecoveryFailure(request, "local_recovery_drills.list");
  }
}
