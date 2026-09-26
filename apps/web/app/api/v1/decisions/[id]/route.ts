import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  projectDecisionSchema,
  reviseProjectDecisionRequestSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../lib/http";
import {
  getProjectDecisionService,
  projectDecisionFailure,
} from "../../../../../lib/project-decisions";

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
      { code: "INVALID_ID", message: "Invalid decision ID" },
      400,
      "decisions.invalid_id",
    );
  try {
    const decision = await getProjectDecisionService().get(id);
    return decision
      ? jsonResponse(
          request,
          projectDecisionSchema.parse(decision),
          200,
          "decisions.read",
        )
      : jsonResponse(
          request,
          { code: "DECISION_NOT_FOUND", message: "Decision not found" },
          404,
          "decisions.not_found",
        );
  } catch (error) {
    return projectDecisionFailure(request, error, "decisions.read");
  }
}

export async function PUT(
  request: Request,
  context: Context,
): Promise<Response> {
  loadRuntimeConfig();
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success)
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "Invalid decision ID" },
      400,
      "decisions.invalid_id",
    );
  const parsed = reviseProjectDecisionRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid decision revision" },
      400,
      "decisions.invalid_body",
    );
  try {
    const decision = await getProjectDecisionService().revise(id, parsed.data);
    return jsonResponse(
      request,
      projectDecisionSchema.parse(decision),
      200,
      "decisions.revised",
    );
  } catch (error) {
    return projectDecisionFailure(request, error, "decisions.revise");
  }
}
