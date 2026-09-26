import {
  createLocalIntegrationRequestSchema,
  listLocalIntegrationsQuerySchema,
  listLocalIntegrationsResponseSchema,
  localIntegrationSchema,
} from "@commandry/contracts";
import { loadRuntimeConfig } from "@commandry/config";
import { jsonResponse } from "../../../../lib/http";
import {
  getLocalIntegrationService,
  localIntegrationFailure,
  localIntegrationWriteAllowed,
} from "../../../../lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  loadRuntimeConfig();
  const parsed = listLocalIntegrationsQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid integration page query" },
      400,
      "integrations.invalid_query",
    );
  }
  try {
    const page = await (await getLocalIntegrationService()).list(parsed.data);
    return jsonResponse(
      request,
      listLocalIntegrationsResponseSchema.parse(page),
      200,
      "integrations.list",
    );
  } catch (error) {
    return localIntegrationFailure(request, error, "integrations.list");
  }
}

export async function POST(request: Request): Promise<Response> {
  const denied = localIntegrationWriteAllowed(request);
  if (denied) return denied;
  const parsed = createLocalIntegrationRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid local integration" },
      400,
      "integrations.invalid_body",
    );
  }
  try {
    const created = await (
      await getLocalIntegrationService()
    ).create(parsed.data);
    return jsonResponse(
      request,
      localIntegrationSchema.parse(created),
      201,
      "integrations.created",
    );
  } catch (error) {
    return localIntegrationFailure(request, error, "integrations.create");
  }
}
