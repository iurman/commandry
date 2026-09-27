import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  projectPresentationEventSchema,
} from "@commandry/contracts";
import {
  catalogFailure,
  getCatalogService,
} from "../../../../../../../../lib/catalog";
import { jsonResponse } from "../../../../../../../../lib/http";

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
      "projects.presentation.changes.invalid_id",
    );
  }
  try {
    const event = await getCatalogService().getProjectPresentationEvent(
      id,
      version,
    );
    return event
      ? jsonResponse(
          request,
          projectPresentationEventSchema.parse(event),
          200,
          "projects.presentation.changes.read",
        )
      : jsonResponse(
          request,
          { code: "NOT_FOUND", message: "View change not found" },
          404,
          "projects.presentation.changes.not_found",
        );
  } catch (error) {
    return catalogFailure(request, error, "projects.presentation.changes.read");
  }
}
