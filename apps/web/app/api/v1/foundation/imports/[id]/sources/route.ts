import {
  foundationImportOriginalQuerySchema,
  foundationImportOriginalPageSchema,
} from "@commandry/contracts";
import {
  foundationFailure,
  foundationImportOutput,
  foundationImportOwner,
} from "../../../../../../../lib/foundation-access";
import { jsonResponse } from "../../../../../../../lib/http";

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
      [...query.keys()].some(
        (key) =>
          !["projectId", "fromOrdinal", "limit"].includes(key) ||
          query.getAll(key).length !== 1,
      ) ||
      !query.has("projectId")
    )
      return jsonResponse(request, { code: "INVALID_INPUT" }, 400);
    const input: Record<string, unknown> = {
      projectId: query.get("projectId"),
      revisionId: (await context.params).id,
    };
    for (const key of ["fromOrdinal", "limit"]) {
      if (query.has(key)) {
        const value = query.get(key)!;
        if (!/^(0|[1-9][0-9]*)$/.test(value))
          return jsonResponse(request, { code: "INVALID_INPUT" }, 400);
        input[key] = Number(value);
      }
    }
    return jsonResponse(
      request,
      foundationImportOutput(
        foundationImportOriginalPageSchema,
        await owner.listOriginalSources(
          foundationImportOriginalQuerySchema.parse(input),
        ),
      ),
      200,
      "foundation.owner.import.sources",
    );
  } catch (error) {
    return foundationFailure(request, error);
  }
}
