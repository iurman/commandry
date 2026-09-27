import { loadRuntimeConfig } from "@commandry/config";
import {
  archiveSystemRequestSchema,
  entityIdSchema,
  systemSummarySchema,
} from "@commandry/contracts";
import {
  getSystemContextService,
  systemContextFailure,
} from "../../../../../../lib/systems";
import { jsonResponse } from "../../../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function PUT(
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
  const parsed = archiveSystemRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid system archive request" },
      400,
      "systems.invalid_body",
    );
  try {
    const saved = await getSystemContextService().archiveSystem(
      id,
      parsed.data,
    );
    return jsonResponse(
      request,
      systemSummarySchema.parse(saved),
      200,
      "systems.archive",
    );
  } catch (error) {
    return systemContextFailure(request, error, "systems.archive");
  }
}
