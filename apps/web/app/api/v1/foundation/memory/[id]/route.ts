import { foundationReadRecordSchema } from "@commandry/contracts";
import {
  foundationFailure,
  foundationOwner,
} from "../../../../../../lib/foundation-access";
import { jsonResponse } from "../../../../../../lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const owner = await foundationOwner(request);
    const query = new URL(request.url).searchParams;
    if (
      [...query.keys()].some(
        (key) => key !== "projectId" || query.getAll(key).length !== 1,
      )
    )
      return jsonResponse(request, { code: "INVALID_INPUT" }, 400);
    const input = foundationReadRecordSchema.parse({
      projectId: query.get("projectId"),
      id: (await context.params).id,
    });
    return jsonResponse(
      request,
      await owner.getMemory(input),
      200,
      "foundation.owner.memory.read",
    );
  } catch (error) {
    return foundationFailure(request, error);
  }
}
