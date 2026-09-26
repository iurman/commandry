import { loadRuntimeConfig } from "@commandry/config";
import {
  listSyntheticAlertsQuerySchema,
  listSyntheticAlertsResponseSchema,
} from "@commandry/contracts";
import {
  getSyntheticEventReadService,
  syntheticEventFailure,
} from "../../../../lib/events";
import { jsonResponse } from "../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  loadRuntimeConfig();
  const parsed = listSyntheticAlertsQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid alert page query" },
      400,
      "alerts.invalid_query",
    );
  try {
    const page = await getSyntheticEventReadService().listAlerts(parsed.data);
    return jsonResponse(
      request,
      listSyntheticAlertsResponseSchema.parse(page),
      200,
      "alerts.list",
    );
  } catch (error) {
    return syntheticEventFailure(request, error, "alerts.list");
  }
}
