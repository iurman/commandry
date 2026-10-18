import { observatoryOwnerLogos } from "../../../../../../lib/observatory";
import { foundationFailure } from "../../../../../../lib/foundation-access";
import {
  readObservatoryJson,
  ObservatoryBodyTooLarge,
  OBSERVATORY_LOGO_BODY_BYTES,
  observatoryLogoFailure,
} from "../../../../../../lib/observatory-http";
import { jsonResponse } from "../../../../../../lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Owner-only preview: processes an upload or a reviewed repository file and
 * returns the PNG it would store. Nothing is written. */
export async function POST(request: Request): Promise<Response> {
  try {
    const { service, identity } = await observatoryOwnerLogos(request);
    const result = await service.preview(
      identity,
      await readObservatoryJson(request, OBSERVATORY_LOGO_BODY_BYTES),
    );
    return jsonResponse(request, result, 200, "observatory.logo.preview");
  } catch (error) {
    if (error instanceof ObservatoryBodyTooLarge)
      return jsonResponse(
        request,
        { code: "INPUT_TOO_LARGE" },
        413,
        "observatory.logo.preview.denied",
      );
    if (error instanceof SyntaxError)
      return jsonResponse(
        request,
        { code: "INVALID_INPUT" },
        400,
        "observatory.logo.preview.denied",
      );
    const logo = observatoryLogoFailure(error);
    if (logo)
      return jsonResponse(
        request,
        { code: logo.code },
        logo.status,
        "observatory.logo.preview.denied",
      );
    return foundationFailure(request, error);
  }
}
