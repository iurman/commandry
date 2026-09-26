import { loadRuntimeConfig } from "@commandry/config";
import {
  createOvernightQueueEntryRequestSchema,
  listOvernightQueueQuerySchema,
  listOvernightQueueResponseSchema,
  overnightQueueEntrySchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../lib/http";
import {
  getOvernightQueueService,
  overnightQueueFailure,
} from "../../../../lib/overnight-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  loadRuntimeConfig();
  const query = listOvernightQueueQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid overnight queue query" },
      400,
      "overnight.list.invalid_query",
    );
  try {
    const page = await (await getOvernightQueueService()).list(query.data);
    return jsonResponse(
      request,
      listOvernightQueueResponseSchema.parse(page),
      200,
      "overnight.list",
    );
  } catch (error) {
    return overnightQueueFailure(request, error, "overnight.list");
  }
}

export async function POST(request: Request): Promise<Response> {
  loadRuntimeConfig();
  const input = createOvernightQueueEntryRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!input.success)
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid overnight schedule" },
      400,
      "overnight.schedule.invalid_body",
    );
  try {
    const entry = await (await getOvernightQueueService()).schedule(input.data);
    return jsonResponse(
      request,
      overnightQueueEntrySchema.parse(entry),
      201,
      "overnight.schedule",
    );
  } catch (error) {
    return overnightQueueFailure(request, error, "overnight.schedule");
  }
}
