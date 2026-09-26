import { loadRuntimeConfig } from "@commandry/config";
import { entityIdSchema, localMcpSessionSchema } from "@commandry/contracts";
import { jsonResponse } from "../../../../../lib/http";
import {
  getLocalMcpService,
  localMcpFailure,
} from "../../../../../lib/local-mcp";

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
      "mcp_sessions.get.invalid_id",
    );
  try {
    const session = await getLocalMcpService().getById(id);
    if (!session)
      return jsonResponse(
        request,
        { code: "SESSION_NOT_FOUND", message: "Local MCP session not found" },
        404,
        "mcp_sessions.get.not_found",
      );
    return jsonResponse(
      request,
      localMcpSessionSchema.parse(session),
      200,
      "mcp_sessions.get",
    );
  } catch (error) {
    return localMcpFailure(request, error, "mcp_sessions.get");
  }
}
