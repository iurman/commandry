import { loadRuntimeConfig } from "@commandry/config";
import {
  overnightReadinessQuerySchema,
  overnightReadinessSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../lib/http";
import {
  getOvernightQueueService,
  overnightQueueFailure,
} from "../../../../../lib/overnight-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  loadRuntimeConfig();
  const query = overnightReadinessQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Packet and agent IDs are required" },
      400,
      "overnight.readiness.invalid_query",
    );
  try {
    const readiness = await (
      await getOvernightQueueService()
    ).readiness(query.data.packetId, query.data.agentId);
    return jsonResponse(
      request,
      overnightReadinessSchema.parse(readiness),
      200,
      "overnight.readiness",
    );
  } catch (error) {
    return overnightQueueFailure(request, error, "overnight.readiness");
  }
}
