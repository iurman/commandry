import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  listKnowledgeProjectAuditResponseSchema,
  listResourcesQuerySchema,
} from "@commandry/contracts";
import {
  getKnowledgeProjectContextService,
  knowledgeProjectFailure,
} from "../../../../../../lib/knowledge-projects";
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
      { code: "INVALID_ID", message: "Invalid knowledge ID" },
      400,
      "knowledge.projects.audit.invalid_id",
    );
  const query = listResourcesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success)
    return jsonResponse(
      request,
      {
        code: "INVALID_QUERY",
        message: "Invalid knowledge project audit page",
      },
      400,
      "knowledge.projects.audit.invalid_query",
    );
  try {
    const page = await getKnowledgeProjectContextService().listAudit(
      id,
      query.data,
    );
    return jsonResponse(
      request,
      listKnowledgeProjectAuditResponseSchema.parse(page),
      200,
      "knowledge.projects.audit.list",
    );
  } catch (error) {
    return knowledgeProjectFailure(
      request,
      error,
      "knowledge.projects.audit.list",
    );
  }
}
