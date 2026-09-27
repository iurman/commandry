import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  projectMetadataEventSchema,
} from "@commandry/contracts";
import {
  catalogFailure,
  getCatalogService,
} from "../../../../../../../lib/catalog";
import { jsonResponse } from "../../../../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; version: string }> },
): Promise<Response> {
  loadRuntimeConfig();
  const { id, version: rawVersion } = await context.params;
  const version = Number(rawVersion);
  if (
    !entityIdSchema.safeParse(id).success ||
    !/^[0-9]+$/.test(rawVersion) ||
    !Number.isSafeInteger(version) ||
    version < 2
  ) {
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "Valid project and version required" },
      400,
      "projects.changes.invalid_id",
    );
  }
  try {
    const event = await getCatalogService().getProjectMetadataEvent(
      id,
      version,
    );
    return event
      ? jsonResponse(
          request,
          projectMetadataEventSchema.parse(event),
          200,
          "projects.changes.read",
        )
      : jsonResponse(
          request,
          { code: "NOT_FOUND", message: "Project change not found" },
          404,
          "projects.changes.not_found",
        );
  } catch (error) {
    return catalogFailure(request, error, "projects.changes.read");
  }
}
