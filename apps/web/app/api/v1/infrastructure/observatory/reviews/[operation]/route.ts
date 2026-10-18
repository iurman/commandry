import { FoundationError } from "@commandry/domain";
import {
  observatoryOwnerLogos,
  observatoryOwnerManagement,
} from "../../../../../../../lib/observatory";
import { foundationFailure } from "../../../../../../../lib/foundation-access";
import {
  readObservatoryJson,
  ObservatoryBodyTooLarge,
  OBSERVATORY_LOGO_BODY_BYTES,
  observatoryLogoFailure,
} from "../../../../../../../lib/observatory-http";
import { jsonResponse } from "../../../../../../../lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  context: { params: Promise<{ operation: string }> },
) {
  try {
    const { operation } = await context.params;
    if (operation === "logo") {
      const { service, identity } = await observatoryOwnerLogos(request);
      const result = await service.review(
        identity,
        await readObservatoryJson(request, OBSERVATORY_LOGO_BODY_BYTES),
      );
      return jsonResponse(request, result, 200, "observatory.logo.review");
    }
    if (
      operation !== "annotation" &&
      operation !== "relation" &&
      operation !== "provider" &&
      operation !== "source" &&
      operation !== "client_scope"
    )
      throw new FoundationError("NOT_FOUND");
    const { service, identity } = await observatoryOwnerManagement(request);
    const result = await service.review(
      identity,
      operation,
      await readObservatoryJson(request),
    );
    return jsonResponse(
      request,
      result,
      200,
      "observatory." + operation + ".review",
    );
  } catch (error) {
    if (error instanceof ObservatoryBodyTooLarge)
      return jsonResponse(
        request,
        { code: "INPUT_TOO_LARGE" },
        413,
        "observatory.review.denied",
      );
    if (error instanceof SyntaxError)
      return jsonResponse(
        request,
        { code: "INVALID_INPUT" },
        400,
        "observatory.review.denied",
      );
    const logo = observatoryLogoFailure(error);
    if (logo)
      return jsonResponse(
        request,
        { code: logo.code },
        logo.status,
        "observatory.review.denied",
      );
    return foundationFailure(request, error);
  }
}
