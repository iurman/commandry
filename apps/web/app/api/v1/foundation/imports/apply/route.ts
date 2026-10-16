import {
  foundationSelectedImportInputSchema,
  foundationSelectedImportResultSchema,
} from "@commandry/contracts";
import {
  foundationFailure,
  foundationImportOutput,
  foundationImportOwner,
} from "../../../../../../lib/foundation-access";
import {
  FoundationImportBodyError,
  foundationImportBody,
} from "../../../../../../lib/foundation-import-body";
import { jsonResponse } from "../../../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const owner = await foundationImportOwner(request);
    const input = foundationSelectedImportInputSchema.parse(
      await foundationImportBody(request),
    );
    return jsonResponse(
      request,
      foundationImportOutput(
        foundationSelectedImportResultSchema,
        await owner.apply(input, request.headers.get("idempotency-key")),
      ),
      200,
      "foundation.owner.import.apply",
    );
  } catch (error) {
    if (error instanceof FoundationImportBodyError)
      return jsonResponse(request, { code: error.code }, error.status);
    return foundationFailure(request, error);
  }
}
