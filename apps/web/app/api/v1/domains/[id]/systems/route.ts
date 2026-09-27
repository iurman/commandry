import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  listDomainSystemsResponseSchema,
  listResourcesQuerySchema,
} from "@commandry/contracts";
import {
  getSystemContextService,
  systemContextFailure,
} from "../../../../../../lib/systems";
import { jsonResponse } from "../../../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(
  request: Request,
  context: Context,
): Promise<Response> {
  loadRuntimeConfig();
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success)
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "Invalid domain ID" },
      400,
      "domains.systems.invalid_id",
    );
  const parsed = listResourcesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid domain system page" },
      400,
      "domains.systems.invalid_query",
    );
  try {
    const page = await getSystemContextService().listDomainSystems(
      id,
      parsed.data,
    );
    return jsonResponse(
      request,
      listDomainSystemsResponseSchema.parse(page),
      200,
      "domains.systems.list",
    );
  } catch (error) {
    return systemContextFailure(request, error, "domains.systems.list");
  }
}
