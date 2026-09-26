import { loadRuntimeConfig } from "@commandry/config";
import {
  createLocalMcpSessionRequestSchema,
  createdLocalMcpSessionSchema,
  listLocalMcpSessionsQuerySchema,
  listLocalMcpSessionsResponseSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../lib/http";
import { getLocalMcpService, localMcpFailure } from "../../../../lib/local-mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  loadRuntimeConfig();
  const query = listLocalMcpSessionsQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid local MCP session query" },
      400,
      "mcp_sessions.invalid_query",
    );
  try {
    return jsonResponse(
      request,
      listLocalMcpSessionsResponseSchema.parse(
        await getLocalMcpService().list(query.data),
      ),
      200,
      "mcp_sessions.list",
    );
  } catch (error) {
    return localMcpFailure(request, error, "mcp_sessions.list");
  }
}

export async function POST(request: Request): Promise<Response> {
  loadRuntimeConfig();
  const input = createLocalMcpSessionRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!input.success)
    return jsonResponse(
      request,
      {
        code: "INVALID_BODY",
        message: "Packet and local agent IDs are required",
      },
      400,
      "mcp_sessions.invalid_body",
    );
  try {
    const session = await getLocalMcpService().createSession(input.data);
    return jsonResponse(
      request,
      createdLocalMcpSessionSchema.parse(session),
      201,
      "mcp_sessions.created",
    );
  } catch (error) {
    return localMcpFailure(request, error, "mcp_sessions.create");
  }
}
