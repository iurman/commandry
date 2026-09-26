import { healthResponseSchema } from "@commandry/contracts";
import { jsonResponse } from "../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  return jsonResponse(
    request,
    healthResponseSchema.parse({ status: "alive", service: "web" }),
    200,
    "health.live",
  );
}
