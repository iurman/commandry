import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  knowledgeItemSchema,
  listKnowledgeItemRevisionsResponseSchema,
  listResourcesQuerySchema,
  reviseKnowledgeItemRequestSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../../lib/http";
import {
  getKnowledgeRevisionsService,
  knowledgeRevisionFailure,
} from "../../../../../../lib/knowledge-revisions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  loadRuntimeConfig();
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success) {
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "A valid knowledge item ID is required" },
      400,
      "knowledge_revisions.invalid_id",
    );
  }
  const parsed = listResourcesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid revision page" },
      400,
      "knowledge_revisions.invalid_query",
    );
  }
  try {
    const page = await getKnowledgeRevisionsService().listRevisions(
      id,
      parsed.data,
    );
    return jsonResponse(
      request,
      listKnowledgeItemRevisionsResponseSchema.parse(page),
      200,
      "knowledge_revisions.list",
    );
  } catch (error) {
    return knowledgeRevisionFailure(request, error, "knowledge_revisions.list");
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  loadRuntimeConfig();
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success) {
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "A valid knowledge item ID is required" },
      400,
      "knowledge_revisions.invalid_id",
    );
  }
  const parsed = reviseKnowledgeItemRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid knowledge note revision" },
      400,
      "knowledge_revisions.invalid_body",
    );
  }
  try {
    const updated = await getKnowledgeRevisionsService().revise(
      id,
      parsed.data,
    );
    return jsonResponse(
      request,
      knowledgeItemSchema.parse(updated),
      200,
      "knowledge_revisions.created",
    );
  } catch (error) {
    return knowledgeRevisionFailure(
      request,
      error,
      "knowledge_revisions.create",
    );
  }
}
