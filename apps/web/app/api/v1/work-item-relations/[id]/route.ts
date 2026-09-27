import { loadRuntimeConfig } from "@commandry/config";
import { entityIdSchema, workItemRelationSchema } from "@commandry/contracts";
import { jsonResponse } from "../../../../../lib/http";
import {
  getWorkRelationsService,
  workRelationsFailure,
} from "../../../../../lib/work-relations";

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
      { code: "INVALID_ID", message: "A valid relationship ID is required" },
      400,
      "work_relations.invalid_id",
    );
  try {
    const relation = await getWorkRelationsService().getById(id);
    return relation
      ? jsonResponse(
          request,
          workItemRelationSchema.parse(relation),
          200,
          "work_relations.read",
        )
      : jsonResponse(
          request,
          { code: "NOT_FOUND", message: "Work relationship not found" },
          404,
          "work_relations.not_found",
        );
  } catch (error) {
    return workRelationsFailure(request, error, "work_relations.read");
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  loadRuntimeConfig();
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success)
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "A valid relationship ID is required" },
      400,
      "work_relations.invalid_id",
    );
  try {
    return jsonResponse(
      request,
      workItemRelationSchema.parse(await getWorkRelationsService().archive(id)),
      200,
      "work_relations.archived",
    );
  } catch (error) {
    return workRelationsFailure(request, error, "work_relations.archive");
  }
}
