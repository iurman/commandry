import { loadRuntimeConfig } from "@commandry/config";
import {
  listWorkspaceWorkQuerySchema,
  listWorkspaceWorkResponseSchema,
} from "@commandry/contracts";
import { captureFailure, getCaptureService } from "../../../../lib/capture";
import { jsonResponse } from "../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  loadRuntimeConfig();
  const query = listWorkspaceWorkQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success) {
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid work page query" },
      400,
      "work_items.invalid_query",
    );
  }
  try {
    const page = await getCaptureService().listWork(query.data);
    return jsonResponse(
      request,
      listWorkspaceWorkResponseSchema.parse(page),
      200,
      "work_items.list",
    );
  } catch (error) {
    return captureFailure(request, error, "work_items.list");
  }
}
