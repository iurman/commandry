import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  listLocalMcpAuditResponseSchema,
  listResourcesQuerySchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../../lib/http";
import {
  getLocalMcpService,
  localMcpFailure,
} from "../../../../../../lib/local-mcp";

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
      { code: "INVALID_ID", message: "Valid session ID required" },
      400,
      "mcp_sessions.audit.invalid_id",
    );
  const query = listResourcesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid audit page query" },
      400,
      "mcp_sessions.audit.invalid_query",
    );
  try {
    return jsonResponse(
      request,
      listLocalMcpAuditResponseSchema.parse(
        await getLocalMcpService().listAudit(id, query.data),
      ),
      200,
      "mcp_sessions.audit",
    );
  } catch (error) {
    return localMcpFailure(request, error, "mcp_sessions.audit");
  }
}
