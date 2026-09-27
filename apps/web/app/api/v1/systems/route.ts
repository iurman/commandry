import { loadRuntimeConfig } from "@commandry/config";
import {
  createSystemRequestSchema,
  listSystemsQuerySchema,
  listSystemsResponseSchema,
  systemSummarySchema,
} from "@commandry/contracts";
import {
  getSystemContextService,
  systemContextFailure,
} from "../../../../lib/systems";
import { jsonResponse } from "../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  loadRuntimeConfig();
  const parsed = listSystemsQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid system page query" },
      400,
      "systems.invalid_query",
    );
  try {
    const page = await getSystemContextService().listSystems(parsed.data);
    return jsonResponse(
      request,
      listSystemsResponseSchema.parse(page),
      200,
      "systems.list",
    );
  } catch (error) {
    return systemContextFailure(request, error, "systems.list");
  }
}

export async function POST(request: Request): Promise<Response> {
  loadRuntimeConfig();
  const parsed = createSystemRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid system" },
      400,
      "systems.invalid_body",
    );
  try {
    const saved = await getSystemContextService().createSystem(parsed.data);
    return jsonResponse(
      request,
      systemSummarySchema.parse(saved),
      201,
      "systems.create",
    );
  } catch (error) {
    return systemContextFailure(request, error, "systems.create");
  }
}
