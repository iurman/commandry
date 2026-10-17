import { observatoryOwnerWork } from "../../../../../../../lib/observatory";
import { foundationFailure } from "../../../../../../../lib/foundation-access";
import { jsonResponse } from "../../../../../../../lib/http";
import {
  ObservatoryBodyTooLarge,
  readObservatoryJson,
} from "../../../../../../../lib/observatory-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const { service, identity } = await observatoryOwnerWork(request);
    const result = await service.listProjectWork(
      identity,
      await readObservatoryJson(request),
    );
    return jsonResponse(request, result, 200, "observatory.work.read");
  } catch (error) {
    if (error instanceof ObservatoryBodyTooLarge)
      return jsonResponse(request, { code: "INPUT_TOO_LARGE" }, 413);
    if (error instanceof SyntaxError)
      return jsonResponse(request, { code: "INVALID_INPUT" }, 400);
    return foundationFailure(request, error);
  }
}
