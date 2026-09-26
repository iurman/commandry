import { loadRuntimeConfig } from "@commandry/config";
import {
  listNormalizedEventsQuerySchema,
  listNormalizedEventsResponseSchema,
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
  const parsed = listNormalizedEventsQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid event page query" },
      400,
      "events.invalid_query",
    );
  try {
    const page = await getSyntheticEventReadService().listEvents(parsed.data);
    return jsonResponse(
      request,
      listNormalizedEventsResponseSchema.parse(page),
      200,
      "events.list",
    );
  } catch (error) {
    return syntheticEventFailure(request, error, "events.list");
  }
}
