import { loadRuntimeConfig } from "@commandry/config";
import { syntheticAlertSchema } from "@commandry/contracts";
import { z } from "zod";
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
  if (!z.uuid().safeParse(id).success)
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "Invalid alert ID" },
      400,
      "alerts.invalid_id",
    );
  try {
    const item = await getSyntheticEventReadService().getAlertById(id);
    return item
      ? jsonResponse(
          request,
          syntheticAlertSchema.parse(item),
          200,
          "alerts.read",
        )
      : jsonResponse(
          request,
          { code: "NOT_FOUND", message: "Alert not found" },
          404,
          "alerts.not_found",
        );
  } catch (error) {
    return syntheticEventFailure(request, error, "alerts.read");
  }
}
