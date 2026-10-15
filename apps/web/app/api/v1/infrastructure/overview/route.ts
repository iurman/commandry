import { loadRuntimeConfig } from "@commandry/config";
import {
  infrastructureOverviewQuerySchema,
  infrastructureOverviewSchema,
} from "@commandry/contracts";
import { createInfrastructureOverviewService } from "@commandry/application";
import { createInfrastructureOverviewRepository } from "@commandry/db";
import { getDatabase } from "../../../../../lib/database";
import { jsonResponse } from "../../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  loadRuntimeConfig();
  const parsed = infrastructureOverviewQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      {
        code: "INVALID_QUERY",
        message: "Invalid infrastructure scope or page",
      },
      400,
      "infrastructure.invalid_query",
    );
  try {
    const service = createInfrastructureOverviewService(
      createInfrastructureOverviewRepository(getDatabase().db),
    );
    return jsonResponse(
      request,
      infrastructureOverviewSchema.parse(await service.read(parsed.data)),
      200,
      "infrastructure.read",
    );
  } catch {
    return jsonResponse(
      request,
      {
        code: "DATABASE_UNAVAILABLE",
        message: "Infrastructure overview is unavailable",
      },
      503,
      "infrastructure.unavailable",
    );
  }
}
