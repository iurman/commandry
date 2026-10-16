import { createMcpHandler } from "@modelcontextprotocol/server";
import { FoundationError } from "@commandry/domain";
import { foundationActorSchema } from "@commandry/contracts";
import {
  foundationFailure,
  getFoundationServices,
  requireFoundationOrigin,
} from "../../../../lib/foundation-access";
import { createFoundationMcpServer } from "../../../../lib/foundation-mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
): Promise<Response> {
  try {
    requireFoundationOrigin(request);
    const projectId = foundationActorSchema.shape.projectId.parse(
      (await context.params).projectId,
    );
    const match = /^Bearer (af_[A-Za-z0-9_-]{43})$/.exec(
      request.headers.get("authorization") ?? "",
    );
    if (!match)
      throw new FoundationError(
        "INVALID_CREDENTIAL",
        "Foundation credential required",
      );
    const token = match[1]!;
    const {
      machine,
      authentication,
      evaluation,
      inventory,
      work,
      resources,
      proposals,
      improvement,
      findings,
      onboarding,
      context: workingContext,
    } = getFoundationServices();
    const actor = await authentication.authenticate(token, projectId);
    const handler = createMcpHandler(
      () =>
        createFoundationMcpServer(machine, token, actor, {
          evaluation,
          inventory,
          work,
          resources,
          proposals,
          improvement,
          findings,
          onboarding,
          context: workingContext,
        }),
      { responseMode: "json" },
    );
    const response = await handler.fetch(request);
    response.headers.set("cache-control", "no-store");
    return response;
  } catch (error) {
    return foundationFailure(request, error);
  }
}
