import { loadRuntimeConfig } from "@commandry/config";
import { localRecoveryStatusSchema } from "@commandry/contracts";
import { jsonResponse } from "../../../../lib/http";
import {
  getLocalRecoveryService,
  localRecoveryFailure,
} from "../../../../lib/local-recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  loadRuntimeConfig();
  try {
    const status = await getLocalRecoveryService().getStatus();
    return jsonResponse(
      request,
      localRecoveryStatusSchema.parse(status),
      200,
      "local_recovery_status.get",
    );
  } catch {
    return localRecoveryFailure(request, "local_recovery_status.get");
  }
}
