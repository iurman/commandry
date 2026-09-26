import { loadRuntimeConfig } from "@commandry/config";
import {
  listResourcesQuerySchema,
  listUpcomingWorkResponseSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../lib/http";
import {
  getWorkPlanningService,
  workPlanningFailure,
} from "../../../../../lib/work-planning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  loadRuntimeConfig();
  const parsed = listResourcesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid upcoming work page" },
      400,
      "upcoming_work.invalid_query",
    );
  }
  try {
    const page = await getWorkPlanningService().listUpcoming(parsed.data);
    return jsonResponse(
      request,
      listUpcomingWorkResponseSchema.parse(page),
      200,
      "upcoming_work.list",
    );
  } catch (error) {
    return workPlanningFailure(request, error, "upcoming_work.list");
  }
}
