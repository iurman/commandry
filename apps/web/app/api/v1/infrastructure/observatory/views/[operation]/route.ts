import { FoundationError } from "@commandry/domain";
import { observatoryOwnerViews } from "../../../../../../../lib/observatory";
import { foundationFailure } from "../../../../../../../lib/foundation-access";
import {
  readObservatoryJson,
  ObservatoryBodyTooLarge,
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
    if (!["create", "update", "delete", "read", "page"].includes(operation))
      throw new FoundationError("NOT_FOUND");
    const { service, identity } = await observatoryOwnerViews(request);
    const input = await readObservatoryJson(request);
    const result =
      operation === "create"
        ? await service.create(identity, input)
        : operation === "update"
          ? await service.update(identity, input)
          : operation === "delete"
            ? await service.delete(identity, input)
            : operation === "read"
              ? await service.read(identity, input)
              : await service.page(identity, input);
    return jsonResponse(request, result, 200, "observatory.view." + operation);
  } catch (error) {
    if (error instanceof ObservatoryBodyTooLarge)
      return jsonResponse(
        request,
        { code: "INPUT_TOO_LARGE" },
        413,
        "observatory.view.denied",
      );
    if (error instanceof SyntaxError)
      return jsonResponse(
        request,
        { code: "INVALID_INPUT" },
        400,
        "observatory.view.denied",
      );
    return foundationFailure(request, error);
  }
}
