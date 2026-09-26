import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  overnightQueueEntrySchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../lib/http";
import {
  getOvernightQueueService,
  overnightQueueFailure,
} from "../../../../../lib/overnight-queue";

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
      { code: "INVALID_ID", message: "Valid queue entry ID required" },
      400,
      "overnight.get.invalid_id",
    );
  try {
    const entry = await (await getOvernightQueueService()).getById(id);
    if (!entry)
      return jsonResponse(
        request,
        { code: "ENTRY_NOT_FOUND", message: "Overnight queue entry not found" },
        404,
        "overnight.get.not_found",
      );
    return jsonResponse(
      request,
      overnightQueueEntrySchema.parse(entry),
      200,
      "overnight.get",
    );
  } catch (error) {
    return overnightQueueFailure(request, error, "overnight.get");
  }
}
