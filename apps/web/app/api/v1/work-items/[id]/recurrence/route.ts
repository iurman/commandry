import { loadRuntimeConfig } from "@commandry/config";
import {
  createWorkRecurrenceRequestSchema,
  entityIdSchema,
  getWorkRecurrenceResponseSchema,
  updateWorkRecurrenceRequestSchema,
  workRecurrenceDefinitionSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../../lib/http";
import {
  getWorkRecurrenceService,
  workRecurrenceFailure,
} from "../../../../../../lib/work-recurrence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

async function workId(
  request: Request,
  context: Context,
): Promise<string | Response> {
  const { id } = await context.params;
  return entityIdSchema.safeParse(id).success
    ? id
    : jsonResponse(
        request,
        { code: "INVALID_ID", message: "A valid work item ID is required" },
        400,
        "work_recurrence.invalid_id",
      );
}

export async function GET(
  request: Request,
  context: Context,
): Promise<Response> {
  loadRuntimeConfig();
  const id = await workId(request, context);
  if (id instanceof Response) return id;
  try {
    const definition =
      await getWorkRecurrenceService().getDefinitionByWorkItemId(id);
    return jsonResponse(
      request,
      getWorkRecurrenceResponseSchema.parse({ definition }),
      200,
      "work_recurrence.get",
    );
  } catch (error) {
    return workRecurrenceFailure(request, error, "work_recurrence.get");
  }
}

export async function POST(
  request: Request,
  context: Context,
): Promise<Response> {
  loadRuntimeConfig();
  const id = await workId(request, context);
  if (id instanceof Response) return id;
  const parsed = createWorkRecurrenceRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid recurring Work schedule" },
      400,
      "work_recurrence.invalid_body",
    );
  }
  try {
    const definition = await getWorkRecurrenceService().createDefinition(
      id,
      parsed.data,
    );
    return jsonResponse(
      request,
      workRecurrenceDefinitionSchema.parse(definition),
      201,
      "work_recurrence.created",
    );
  } catch (error) {
    return workRecurrenceFailure(request, error, "work_recurrence.create");
  }
}

export async function PUT(
  request: Request,
  context: Context,
): Promise<Response> {
  loadRuntimeConfig();
  const id = await workId(request, context);
  if (id instanceof Response) return id;
  const parsed = updateWorkRecurrenceRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid recurring Work update" },
      400,
      "work_recurrence.invalid_body",
    );
  }
  try {
    const definition = await getWorkRecurrenceService().updateDefinition(
      id,
      parsed.data,
    );
    return jsonResponse(
      request,
      workRecurrenceDefinitionSchema.parse(definition),
      200,
      "work_recurrence.updated",
    );
  } catch (error) {
    return workRecurrenceFailure(request, error, "work_recurrence.update");
  }
}
