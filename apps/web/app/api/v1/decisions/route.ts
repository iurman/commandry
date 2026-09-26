import { loadRuntimeConfig } from "@commandry/config";
import {
  listWorkspaceDecisionsResponseSchema,
  listWorkspaceRecordsQuerySchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../lib/http";
import {
  getProjectDecisionService,
  projectDecisionFailure,
} from "../../../../lib/project-decisions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  loadRuntimeConfig();
  const query = listWorkspaceRecordsQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success) {
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid decisions page query" },
      400,
      "decisions.invalid_query",
    );
  }
  try {
    const page = await getProjectDecisionService().listAll(query.data);
    return jsonResponse(
      request,
      listWorkspaceDecisionsResponseSchema.parse(page),
      200,
      "decisions.list_all",
    );
  } catch (error) {
    return projectDecisionFailure(request, error, "decisions.list_all");
  }
}
