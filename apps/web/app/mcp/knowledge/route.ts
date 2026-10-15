import { createMcpHandler } from "@modelcontextprotocol/server";
import { loadRuntimeConfig } from "@commandry/config";
import { KnowledgeAccessError } from "@commandry/domain";
import {
  getKnowledgeAccessService,
  knowledgeFailure,
} from "../../../lib/knowledge-access";
import { createKnowledgeMcpServer } from "../../../lib/knowledge-mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const config = loadRuntimeConfig();
  const origin = request.headers.get("origin");
  if (
    origin &&
    origin !== config.appOrigin &&
    origin !== config.localAuthTrustedOrigin
  )
    return Response.json(
      { code: "ORIGIN_DENIED" },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
  const match = /^Bearer (ck_[A-Za-z0-9_-]{43})$/.exec(
    request.headers.get("authorization") ?? "",
  );
  try {
    if (!match)
      throw new KnowledgeAccessError(
        "TOKEN_INVALID",
        "Read credential required",
      );
    const service = getKnowledgeAccessService();
    await service.authenticate(match[1]!);
    const handler = createMcpHandler(
      () => createKnowledgeMcpServer(service, match[1]!),
      { responseMode: "json" },
    );
    const response = await handler.fetch(request);
    response.headers.set("cache-control", "no-store");
    return response;
  } catch (error) {
    return knowledgeFailure(request, error);
  }
}
