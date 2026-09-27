import {
  entityIdSchema,
  listLocalConnectorFeedResponseSchema,
  listResourcesQuerySchema,
  localConnectorFeedItemSchema,
  runLocalIntegrationSampleRequestSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../../lib/http";
import {
  getLocalConnectorService,
  localIntegrationFailure,
  localIntegrationWriteAllowed,
} from "../../../../../../lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function validate(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const denied = localIntegrationWriteAllowed(request);
  if (denied) return { denied, id: null };
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success)
    return {
      denied: jsonResponse(
        request,
        { code: "INVALID_ID", message: "Invalid integration ID" },
        400,
        "integrations.invalid_id",
      ),
      id: null,
    };
  return { denied: null, id };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { denied, id } = await validate(request, context);
  if (denied || !id) return denied!;
  const parsed = listResourcesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid feed page query" },
      400,
      "integrations.invalid_feed_query",
    );
  try {
    const page = await (await getLocalConnectorService()).list(id, parsed.data);
    return jsonResponse(
      request,
      listLocalConnectorFeedResponseSchema.parse(page),
      200,
      "integrations.local_poll_feed_listed",
    );
  } catch (error) {
    return localIntegrationFailure(
      request,
      error,
      "integrations.local_poll_feed",
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { denied, id } = await validate(request, context);
  if (denied || !id) return denied!;
  const input = runLocalIntegrationSampleRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!input.success)
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid synthetic poll feed item" },
      400,
      "integrations.invalid_feed_body",
    );
  try {
    const queued = await (
      await getLocalConnectorService()
    ).enqueue(id, input.data);
    return jsonResponse(
      request,
      localConnectorFeedItemSchema.parse(queued),
      202,
      "integrations.local_poll_feed_queued",
    );
  } catch (error) {
    return localIntegrationFailure(
      request,
      error,
      "integrations.local_poll_feed",
    );
  }
}
