import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  syntheticMetricSampleSchema,
} from "@commandry/contracts";
import {
  getSyntheticEventReadService,
  syntheticEventFailure,
} from "../../../../../lib/events";
import { jsonResponse } from "../../../../../lib/http";

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
      { code: "INVALID_ID", message: "Invalid metric sample ID" },
      400,
      "metrics.invalid_id",
    );
  try {
    const item = await getSyntheticEventReadService().getMetricSampleById(id);
    return item
      ? jsonResponse(
          request,
          syntheticMetricSampleSchema.parse(item),
          200,
          "metrics.read",
        )
      : jsonResponse(
          request,
          { code: "NOT_FOUND", message: "Metric sample not found" },
          404,
          "metrics.not_found",
        );
  } catch (error) {
    return syntheticEventFailure(request, error, "metrics.read");
  }
}
