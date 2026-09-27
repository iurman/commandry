import { loadRuntimeConfig } from "@commandry/config";
import {
  createKnowledgeProjectLinkRequestSchema,
  entityIdSchema,
  knowledgeProjectConnectionSchema,
  listKnowledgeProjectConnectionsResponseSchema,
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
      "knowledge.projects.invalid_id",
    );
  const query = listResourcesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid knowledge project page" },
      400,
      "knowledge.projects.invalid_query",
    );
  try {
    const page = await getKnowledgeProjectContextService().listLinks(
      id,
      query.data,
    );
    return jsonResponse(
      request,
      listKnowledgeProjectConnectionsResponseSchema.parse(page),
      200,
      "knowledge.projects.list",
    );
  } catch (error) {
    return knowledgeProjectFailure(request, error, "knowledge.projects.list");
  }
}

export async function POST(
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
      "knowledge.projects.invalid_id",
    );
  const parsed = createKnowledgeProjectLinkRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid project relation" },
      400,
      "knowledge.projects.invalid_body",
    );
  try {
    const linked = await getKnowledgeProjectContextService().link(
      id,
      parsed.data.projectId,
    );
    return jsonResponse(
      request,
      knowledgeProjectConnectionSchema.parse(linked),
      200,
      "knowledge.projects.link",
    );
  } catch (error) {
    return knowledgeProjectFailure(request, error, "knowledge.projects.link");
  }
}
