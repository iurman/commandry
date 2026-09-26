import { loadRuntimeConfig } from "@commandry/config";
import {
  listSyntheticMetricsQuerySchema,
  listSyntheticMetricsResponseSchema,
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
  const parsed = listSyntheticMetricsQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid metric page query" },
      400,
      "metrics.invalid_query",
    );
  try {
    const page = await getSyntheticEventReadService().listMetrics(parsed.data);
    return jsonResponse(
      request,
      listSyntheticMetricsResponseSchema.parse(page),
      200,
      "metrics.list",
    );
  } catch (error) {
    return syntheticEventFailure(request, error, "metrics.list");
  }
}
