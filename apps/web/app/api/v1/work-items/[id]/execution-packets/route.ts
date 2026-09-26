import { loadRuntimeConfig } from "@commandry/config";
import {
  createExecutionPacketRequestSchema,
  entityIdSchema,
  executionPacketSchema,
  listExecutionPacketsResponseSchema,
  listResourcesQuerySchema,
} from "@commandry/contracts";
import {
  briefFailure,
  getExecutionPacketService,
} from "../../../../../../lib/briefs";
import { jsonResponse } from "../../../../../../lib/http";

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
      { code: "INVALID_ID", message: "A valid work item ID is required" },
      400,
      "execution_packets.invalid_work_item_id",
    );
  }
  const parsed = listResourcesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid packet page query" },
      400,
      "execution_packets.invalid_query",
    );
  }
  try {
    const page = await getExecutionPacketService().listForWorkItem(
      id,
      parsed.data,
    );
    return jsonResponse(
      request,
      listExecutionPacketsResponseSchema.parse(page),
      200,
      "execution_packets.list",
    );
  } catch (error) {
    return briefFailure(request, error, "execution_packets.list");
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  loadRuntimeConfig();
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success) {
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "A valid work item ID is required" },
      400,
      "execution_packets.invalid_work_item_id",
    );
  }
  const parsed = createExecutionPacketRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid packet selection" },
      400,
      "execution_packets.invalid_body",
    );
  }
  try {
    const packet = await getExecutionPacketService().create(id, parsed.data);
    return jsonResponse(
      request,
      executionPacketSchema.parse(packet),
      201,
      "execution_packets.create",
    );
  } catch (error) {
    return briefFailure(request, error, "execution_packets.create");
  }
}
