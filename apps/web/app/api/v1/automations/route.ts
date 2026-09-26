import { loadRuntimeConfig } from "@commandry/config";
import {
  automationDefinitionSchema,
  createAutomationDefinitionRequestSchema,
  listAutomationDefinitionsQuerySchema,
  listAutomationDefinitionsResponseSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../lib/http";
import {
  getLocalAutomationService,
  localAutomationFailure,
} from "../../../../lib/local-automations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  loadRuntimeConfig();
  const query = listAutomationDefinitionsQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid automation page query" },
      400,
      "automations.invalid_query",
    );
  try {
    const page = await (
      await getLocalAutomationService()
    ).listDefinitions(query.data);
    return jsonResponse(
      request,
      listAutomationDefinitionsResponseSchema.parse(page),
      200,
      "automations.list",
    );
  } catch (error) {
    return localAutomationFailure(request, error, "automations.list");
  }
}

export async function POST(request: Request): Promise<Response> {
  loadRuntimeConfig();
  const parsed = createAutomationDefinitionRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid local automation" },
      400,
      "automations.invalid_body",
    );
  try {
    const definition = await (
      await getLocalAutomationService()
    ).createDefinition(parsed.data);
    return jsonResponse(
      request,
      automationDefinitionSchema.parse(definition),
      201,
      "automations.created",
    );
  } catch (error) {
    return localAutomationFailure(request, error, "automations.create");
  }
}
