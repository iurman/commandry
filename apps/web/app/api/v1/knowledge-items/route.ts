import { loadRuntimeConfig } from "@commandry/config";
import {
  listWorkspaceKnowledgeResponseSchema,
  listWorkspaceKnowledgeQuerySchema,
} from "@commandry/contracts";
import { captureFailure, getCaptureService } from "../../../../lib/capture";
import { jsonResponse } from "../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  loadRuntimeConfig();
  const query = listWorkspaceKnowledgeQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success) {
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid knowledge page query" },
      400,
      "knowledge_items.invalid_query",
    );
  }
  try {
    const page = await getCaptureService().listKnowledge(query.data);
    return jsonResponse(
      request,
      listWorkspaceKnowledgeResponseSchema.parse(page),
      200,
      "knowledge_items.list",
    );
  } catch (error) {
    return captureFailure(request, error, "knowledge_items.list");
  }
}
