import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { loadRuntimeConfig } from "@commandry/config";
import { LocalMcpError } from "@commandry/domain";
import { getLocalMcpService } from "../../lib/local-mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);

function isLoopbackUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "http:" &&
      loopbackHosts.has(url.hostname) &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function buildServer(token: string) {
  const server = new McpServer({
    name: "commandry-local-read-preview",
    version: "1.0.0",
  });
  const service = getLocalMcpService();
  const toolResult = async (input: {
    operation: "project.brief.read" | "work.read";
    projectId: string;
    workItemId?: string;
    reason: string;
  }) => {
    try {
      const result = await service.read(token, input);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: result,
      };
    } catch (error) {
      const code =
        error instanceof LocalMcpError ? error.code : "READ_UNAVAILABLE";
      return {
        isError: true,
        content: [
          { type: "text" as const, text: `Local MCP read denied: ${code}` },
        ],
      };
    }
  };
  server.registerTool(
    "get_project_brief",
    {
      title: "Get scoped project brief",
      description:
        "Read the packet project's deterministic, source-cited brief. Read-only local preview; project scope, expiry, and audit are enforced. No external action.",
      inputSchema: z.object({
        projectId: z.uuid(),
        reason: z.string().trim().min(1).max(500),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ projectId, reason }) =>
      toolResult({ operation: "project.brief.read", projectId, reason }),
  );
  server.registerTool(
    "get_packet_work",
    {
      title: "Get scoped packet work",
      description:
        "Read only the work item bound to this saved packet. Read-only local preview; packet and project scope, expiry, and audit are enforced. No external action.",
      inputSchema: z.object({
        projectId: z.uuid(),
        workItemId: z.uuid(),
        reason: z.string().trim().min(1).max(500),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ projectId, workItemId, reason }) =>
      toolResult({ operation: "work.read", projectId, workItemId, reason }),
  );
  return server;
}

export async function POST(request: Request): Promise<Response> {
  loadRuntimeConfig();
  const forwardedHost = request.headers.get("x-forwarded-host");
  const requestHost = forwardedHost ?? request.headers.get("host");
  if (
    !requestHost ||
    !isLoopbackUrl(`http://${requestHost}`) ||
    (request.headers.has("origin") &&
      !isLoopbackUrl(request.headers.get("origin") ?? ""))
  )
    return Response.json(
      {
        code: "LOCAL_ONLY",
        message: "Local MCP accepts loopback clients only",
      },
      { status: 403 },
    );
  const match = /^Bearer (mcp_[A-Za-z0-9_-]{43})$/.exec(
    request.headers.get("authorization") ?? "",
  );
  if (!match)
    return Response.json(
      { code: "TOKEN_INVALID", message: "Local MCP bearer token required" },
      { status: 401 },
    );
  try {
    await getLocalMcpService().authenticate(match[1]!);
  } catch (error) {
    if (error instanceof LocalMcpError)
      return Response.json(
        { code: error.code, message: error.message },
        { status: 401 },
      );
    return Response.json(
      { code: "DATABASE_UNAVAILABLE", message: "Local MCP is unavailable" },
      { status: 503 },
    );
  }
  const handler = createMcpHandler(() => buildServer(match[1]!), {
    responseMode: "json",
  });
  return handler.fetch(request);
}
