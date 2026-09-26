import {
  entityIdSchema,
  runLocalIntegrationSampleRequestSchema,
  syntheticEventImportSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../../lib/http";
import {
  getLocalIntegrationService,
  localIntegrationFailure,
  localIntegrationWriteAllowed,
} from "../../../../../../lib/integrations";
import { syntheticEventFailure } from "../../../../../../lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = localIntegrationWriteAllowed(request);
  if (denied) return denied;
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success) {
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "Invalid integration ID" },
      400,
      "integrations.invalid_id",
    );
  }
  const parsed = runLocalIntegrationSampleRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid fixture sample" },
      400,
      "integrations.invalid_sample_body",
    );
  }
  try {
    const receipt = await (
      await getLocalIntegrationService()
    ).submitSample(id, parsed.data);
    return jsonResponse(
      request,
      syntheticEventImportSchema.parse(receipt),
      202,
      "integrations.sample_submitted",
    );
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "OCCURRENCE_CONFLICT"
    ) {
      return syntheticEventFailure(request, error, "integrations.sample");
    }
    return localIntegrationFailure(request, error, "integrations.sample");
  }
}
