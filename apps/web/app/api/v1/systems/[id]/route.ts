import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  systemSummarySchema,
  updateSystemRequestSchema,
} from "@commandry/contracts";
import {
  getSystemContextService,
  systemContextFailure,
} from "../../../../../lib/systems";
import { jsonResponse } from "../../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(
  request: Request,
  context: Context,
): Promise<Response> {
  loadRuntimeConfig();
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success)
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "Invalid system ID" },
      400,
      "systems.invalid_id",
    );
  try {
    const saved = await getSystemContextService().getSystem(id);
    return saved
      ? jsonResponse(
          request,
          systemSummarySchema.parse(saved),
          200,
          "systems.read",
        )
      : jsonResponse(
          request,
          { code: "NOT_FOUND", message: "System not found" },
          404,
          "systems.not_found",
        );
  } catch (error) {
    return systemContextFailure(request, error, "systems.read");
  }
}

export async function PATCH(
  request: Request,
  context: Context,
): Promise<Response> {
  loadRuntimeConfig();
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success)
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "Invalid system ID" },
      400,
      "systems.invalid_id",
    );
  const parsed = updateSystemRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid system update" },
      400,
      "systems.invalid_body",
    );
  try {
    const saved = await getSystemContextService().updateSystem(id, parsed.data);
    return jsonResponse(
      request,
      systemSummarySchema.parse(saved),
      200,
      "systems.update",
    );
  } catch (error) {
    return systemContextFailure(request, error, "systems.update");
  }
}
