import { loadRuntimeConfig } from "@commandry/config";
import { entityIdSchema, localMcpSessionSchema } from "@commandry/contracts";
import { jsonResponse } from "../../../../../../lib/http";
import {
  getLocalMcpService,
  localMcpFailure,
} from "../../../../../../lib/local-mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
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
      "mcp_sessions.revoke.invalid_id",
    );
  try {
    return jsonResponse(
      request,
      localMcpSessionSchema.parse(await getLocalMcpService().revoke(id)),
      200,
      "mcp_sessions.revoke",
    );
  } catch (error) {
    return localMcpFailure(request, error, "mcp_sessions.revoke");
  }
}
