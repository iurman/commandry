import { healthResponseSchema } from "@commandry/contracts";
import { getDatabase } from "../../../lib/database";
import { jsonResponse } from "../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    await getDatabase().pool.query("SELECT 1");
    return jsonResponse(
      request,
      healthResponseSchema.parse({
        status: "ready",
        service: "web",
        database: "ready",
      }),
      200,
      "health.ready",
    );
  } catch {
    return jsonResponse(
      request,
      healthResponseSchema.parse({
        status: "not_ready",
        service: "web",
        database: "unavailable",
      }),
      503,
      "health.not_ready",
    );
  }
}
