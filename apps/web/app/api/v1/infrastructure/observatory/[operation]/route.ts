import { observatorySceneQuerySchema } from "@commandry/contracts";
import { FoundationError } from "@commandry/domain";
import { observatoryOwnerRead } from "../../../../../../lib/observatory";
import { foundationFailure } from "../../../../../../lib/foundation-access";
import {
  readObservatoryJson,
  ObservatoryBodyTooLarge,
} from "../../../../../../lib/observatory-http";
import { jsonResponse } from "../../../../../../lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  context: { params: Promise<{ operation: string }> },
): Promise<Response> {
  try {
    const { operation } = await context.params;
    if (
      ![
        "scene",
        "members",
        "relations",
        "signals",
        "providers",
        "operational",
        "catalogue",
        "provider-feed",
        "logo",
      ].includes(operation)
    )
      throw new FoundationError("NOT_FOUND");
    const input = await readObservatoryJson(request);
    const scope = observatorySceneQuerySchema.parse(
      input && typeof input === "object"
        ? { projectId: (input as { projectId?: unknown }).projectId }
        : {},
    );
    const { service, context: owner } = await observatoryOwnerRead(
      request,
      scope.projectId,
    );
    const result =
      operation === "logo"
        ? await service.logo(owner, input)
        : operation === "catalogue"
          ? await service.catalogue(owner, input)
          : operation === "provider-feed"
            ? await service.providerFeed(owner, input)
            : operation === "scene"
              ? await service.scene(owner, input)
              : operation === "members"
                ? await service.members(owner, input)
                : operation === "relations"
                  ? await service.relations(owner, input)
                  : operation === "signals"
                    ? await service.signalEvidence(owner, input)
                    : operation === "operational"
                      ? await service.operationalEvidence(owner, input)
                      : await service.providerExplanation(owner, input);
    return jsonResponse(
      request,
      result,
      200,
      "observatory." + operation + ".read",
    );
  } catch (error) {
    if (error instanceof ObservatoryBodyTooLarge)
      return jsonResponse(
        request,
        { code: "INPUT_TOO_LARGE" },
        413,
        "observatory.read.denied",
      );
    if (error instanceof SyntaxError)
      return jsonResponse(
        request,
        { code: "INVALID_INPUT" },
        400,
        "observatory.read.denied",
      );
    return foundationFailure(request, error);
  }
}
