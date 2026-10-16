import {
  mnemosyneImportEnvelopeSchema,
  mnemosyneImportPlanSchema,
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
    const envelope = mnemosyneImportEnvelopeSchema.parse(
      await foundationImportBody(request),
    );
    return jsonResponse(
      request,
      foundationImportOutput(
        mnemosyneImportPlanSchema,
        await owner.preview(envelope),
      ),
      200,
      "foundation.owner.import.preview",
    );
  } catch (error) {
    if (error instanceof FoundationImportBodyError)
      return jsonResponse(request, { code: error.code }, error.status);
    return foundationFailure(request, error);
  }
}
