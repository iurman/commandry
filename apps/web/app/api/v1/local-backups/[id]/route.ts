import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  localBackupEvidenceSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../lib/http";
import {
  getLocalBackupService,
  localBackupFailure,
} from "../../../../../lib/local-backup";

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
      { code: "INVALID_ID", message: "A valid backup ID is required" },
      400,
      "local_backup.invalid_id",
    );
  try {
    const evidence = await getLocalBackupService().get(id);
    if (!evidence)
      return jsonResponse(
        request,
        { code: "NOT_FOUND", message: "Local backup evidence not found" },
        404,
        "local_backup.not_found",
      );
    return jsonResponse(
      request,
      localBackupEvidenceSchema.parse(evidence),
      200,
      "local_backup.get",
    );
  } catch (error) {
    return localBackupFailure(request, "local_backup.get", error);
  }
}
