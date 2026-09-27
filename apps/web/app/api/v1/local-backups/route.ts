import { loadRuntimeConfig } from "@commandry/config";
import {
  listLocalBackupsQuerySchema,
  listLocalBackupsResponseSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../lib/http";
import {
  getLocalBackupService,
  localBackupFailure,
} from "../../../../lib/local-backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  loadRuntimeConfig();
  const query = listLocalBackupsQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid local backup query" },
      400,
      "local_backups.invalid_query",
    );
  try {
    const page = await getLocalBackupService().list(query.data);
    return jsonResponse(
      request,
      listLocalBackupsResponseSchema.parse(page),
      200,
      "local_backups.list",
    );
  } catch (error) {
    return localBackupFailure(request, "local_backups.list", error);
  }
}
