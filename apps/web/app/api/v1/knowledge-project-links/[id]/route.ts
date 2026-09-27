import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  knowledgeProjectLinkSchema,
} from "@commandry/contracts";
import {
  getKnowledgeProjectContextService,
  knowledgeProjectFailure,
} from "../../../../../lib/knowledge-projects";
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
      { code: "INVALID_ID", message: "Invalid knowledge project link ID" },
      400,
      "knowledge.project_link.invalid_id",
    );
  try {
    const link = await getKnowledgeProjectContextService().getLink(id);
    if (!link)
      return jsonResponse(
        request,
        {
          code: "KNOWLEDGE_PROJECT_LINK_NOT_FOUND",
          message: "Knowledge project link not found",
        },
        404,
        "knowledge.project_link.not_found",
      );
    return jsonResponse(
      request,
      knowledgeProjectLinkSchema.parse(link),
      200,
      "knowledge.project_link.get",
    );
  } catch (error) {
    return knowledgeProjectFailure(
      request,
      error,
      "knowledge.project_link.get",
    );
  }
}
