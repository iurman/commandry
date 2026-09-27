import { loadRuntimeConfig } from "@commandry/config";
import {
  createWorkItemCommentRequestSchema,
  entityIdSchema,
  listResourcesQuerySchema,
  listWorkItemCommentsResponseSchema,
  workItemCommentSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../../lib/http";
import {
  getWorkDiscussionService,
  workDiscussionFailure,
} from "../../../../../../lib/work-discussion";

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
      { code: "INVALID_ID", message: "Valid work item ID required" },
      400,
      "work_comments.invalid_id",
    );
  const query = listResourcesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid comment page query" },
      400,
      "work_comments.invalid_query",
    );
  try {
    return jsonResponse(
      request,
      listWorkItemCommentsResponseSchema.parse(
        await getWorkDiscussionService().list(id, query.data),
      ),
      200,
      "work_comments.list",
    );
  } catch (error) {
    return workDiscussionFailure(request, error, "work_comments.list");
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  loadRuntimeConfig();
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success)
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "Valid work item ID required" },
      400,
      "work_comments.invalid_id",
    );
  const input = createWorkItemCommentRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!input.success)
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Comment body is required" },
      400,
      "work_comments.invalid_body",
    );
  try {
    return jsonResponse(
      request,
      workItemCommentSchema.parse(
        await getWorkDiscussionService().create(id, input.data.body),
      ),
      201,
      "work_comments.created",
    );
  } catch (error) {
    return workDiscussionFailure(request, error, "work_comments.create");
  }
}
