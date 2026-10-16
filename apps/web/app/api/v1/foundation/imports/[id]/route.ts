import {
  foundationImportOriginalQuerySchema,
  foundationImportRevisionSchema,
} from "@commandry/contracts";
import {
  foundationFailure,
  foundationImportOutput,
  foundationImportOwner,
} from "../../../../../../lib/foundation-access";
import { jsonResponse } from "../../../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const owner = await foundationImportOwner(request);
    const query = new URL(request.url).searchParams;
    if (
      [...query.keys()].some((key) => key !== "projectId") ||
      query.getAll("projectId").length !== 1
    )
      return jsonResponse(request, { code: "INVALID_INPUT" }, 400);
    const input = foundationImportOriginalQuerySchema
      .pick({ projectId: true, revisionId: true })
      .parse({
        projectId: query.get("projectId"),
        revisionId: (await context.params).id,
      });
    return jsonResponse(
      request,
      foundationImportOutput(
        foundationImportRevisionSchema,
        await owner.getRevision({
          projectId: input.projectId,
          id: input.revisionId,
        }),
      ),
      200,
      "foundation.owner.import.revision",
    );
  } catch (error) {
    return foundationFailure(request, error);
  }
}
