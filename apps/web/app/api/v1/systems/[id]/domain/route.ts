import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  setSystemDomainRequestSchema,
  systemDomainResponseSchema,
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
      { code: "INVALID_ID", message: "Invalid system ID" },
      400,
      "systems.domain.invalid_id",
    );
  try {
    const membership = await getSystemContextService().getSystemDomain(id);
    return jsonResponse(
      request,
      systemDomainResponseSchema.parse({ membership }),
      200,
      "systems.domain.read",
    );
  } catch (error) {
    return systemContextFailure(request, error, "systems.domain.read");
  }
}

export async function PUT(
  request: Request,
  context: Context,
): Promise<Response> {
  loadRuntimeConfig();
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success)
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "Invalid system ID" },
      400,
      "systems.domain.invalid_id",
    );
  const parsed = setSystemDomainRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid system domain change" },
      400,
      "systems.domain.invalid_body",
    );
  try {
    const membership = await getSystemContextService().setSystemDomain(
      id,
      parsed.data,
    );
    return jsonResponse(
      request,
      systemDomainResponseSchema.parse({ membership }),
      200,
      "systems.domain.change",
    );
  } catch (error) {
    return systemContextFailure(request, error, "systems.domain.change");
  }
}
