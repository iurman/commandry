import { loadRuntimeConfig } from "@commandry/config";
import {
  createWorkItemRelationRequestSchema,
  workItemRelationSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../lib/http";
import {
  getWorkRelationsService,
  workRelationsFailure,
} from "../../../../lib/work-relations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  loadRuntimeConfig();
  const input = createWorkItemRelationRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!input.success)
    return jsonResponse(
      request,
      {
        code: "INVALID_BODY",
        message: "A valid work relationship is required",
      },
      400,
      "work_relations.invalid_body",
    );
  try {
    return jsonResponse(
      request,
      workItemRelationSchema.parse(
        await getWorkRelationsService().create(input.data),
      ),
      201,
      "work_relations.created",
    );
  } catch (error) {
    return workRelationsFailure(request, error, "work_relations.create");
  }
}
