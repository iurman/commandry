import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  workRecurrenceOccurrenceSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../lib/http";
import {
  getWorkRecurrenceService,
  workRecurrenceFailure,
} from "../../../../../lib/work-recurrence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  loadRuntimeConfig();
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success) {
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "A valid occurrence ID is required" },
      400,
      "work_recurrence_occurrence.invalid_id",
    );
  }
  try {
    const occurrence = await getWorkRecurrenceService().getOccurrenceById(id);
    if (!occurrence) {
      return jsonResponse(
        request,
        { code: "NOT_FOUND", message: "Recurring Work occurrence not found" },
        404,
        "work_recurrence_occurrence.not_found",
      );
    }
    return jsonResponse(
      request,
      workRecurrenceOccurrenceSchema.parse(occurrence),
      200,
      "work_recurrence_occurrence.get",
    );
  } catch (error) {
    return workRecurrenceFailure(
      request,
      error,
      "work_recurrence_occurrence.get",
    );
  }
}
