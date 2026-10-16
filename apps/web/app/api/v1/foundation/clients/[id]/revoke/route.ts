import {
  foundationRevokeClientSchema,
  foundationClientSchema,
} from "@commandry/contracts";
import {
  foundationFailure,
  foundationOwner,
} from "../../../../../../../lib/foundation-access";
import { jsonResponse } from "../../../../../../../lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const owner = await foundationOwner(request);
    const input = foundationRevokeClientSchema.parse({
      clientId: (await context.params).id,
    });
    return jsonResponse(
      request,
      foundationClientSchema.parse(await owner.revokeClient(input)),
      200,
      "foundation.client.revoked",
    );
  } catch (error) {
    return foundationFailure(request, error);
  }
}
