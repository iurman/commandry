import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  listResourcesQuerySchema,
  listSystemAuditResponseSchema,
} from "@commandry/contracts";
import {
  getSystemContextService,
  systemContextFailure,
} from "../../../../../../lib/systems";
import { jsonResponse } from "../../../../../../lib/http";

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
      "systems.audit.invalid_id",
    );
  const parsed = listResourcesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid system audit page" },
      400,
      "systems.audit.invalid_query",
    );
  try {
    const page = await getSystemContextService().listSystemAudit(
      id,
      parsed.data,
    );
    return jsonResponse(
      request,
      listSystemAuditResponseSchema.parse(page),
      200,
      "systems.audit.list",
    );
  } catch (error) {
    return systemContextFailure(request, error, "systems.audit.list");
  }
}
