import { loadRuntimeConfig } from "@commandry/config";
import { normalizedEventSchema } from "@commandry/contracts";
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
      { code: "INVALID_ID", message: "Invalid event ID" },
      400,
      "events.invalid_id",
    );
  try {
    const item = await getSyntheticEventReadService().getEventById(id);
    return item
      ? jsonResponse(
          request,
          normalizedEventSchema.parse(item),
          200,
          "events.read",
        )
      : jsonResponse(
          request,
          { code: "NOT_FOUND", message: "Event not found" },
          404,
          "events.not_found",
        );
  } catch (error) {
    return syntheticEventFailure(request, error, "events.read");
  }
}
