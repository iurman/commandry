import {
  foundationClientListSchema,
  foundationCreateClientSchema,
  foundationIssuedClientSchema,
  foundationScopedPageSchema,
} from "@commandry/contracts";
import {
  foundationFailure,
  foundationOwner,
} from "../../../../../lib/foundation-access";
import { realIntegrationBody } from "../../../../../lib/real-integrations";
import { jsonResponse } from "../../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const owner = await foundationOwner(request);
    const query = new URL(request.url).searchParams;
    if ([...query.keys()].some((key) => query.getAll(key).length !== 1))
      return jsonResponse(request, { code: "INVALID_INPUT" }, 400);
    const raw: Record<string, unknown> = Object.fromEntries(query);
    if (query.has("limit")) raw.limit = Number(query.get("limit"));
    const input = foundationScopedPageSchema.parse(raw);
    return jsonResponse(
      request,
      foundationClientListSchema.parse(await owner.listClients(input)),
    );
  } catch (error) {
    return foundationFailure(request, error);
  }
}
export async function POST(request: Request) {
  try {
    const owner = await foundationOwner(request);
    let body: unknown;
    try {
      body = await realIntegrationBody(request);
    } catch {
      return jsonResponse(request, { code: "INVALID_INPUT" }, 400);
    }
    const input = foundationCreateClientSchema.parse(body);
    const result = await owner.createClient(
      input,
      request.headers.get("idempotency-key"),
    );
    return jsonResponse(
      request,
      foundationIssuedClientSchema.parse(result),
      201,
      "foundation.client.created",
    );
  } catch (error) {
    return foundationFailure(request, error);
  }
}
