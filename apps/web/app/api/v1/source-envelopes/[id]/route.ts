import { loadRuntimeConfig } from "@commandry/config";
import { sourceEnvelopeSchema } from "@commandry/contracts";
import { z } from "zod";
import {
  getSyntheticEventReadService,
  syntheticEventFailure,
} from "../../../../../lib/events";
import { jsonResponse } from "../../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  loadRuntimeConfig();
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success)
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "Invalid source envelope ID" },
      400,
      "source_envelopes.invalid_id",
    );
  try {
    const item = await getSyntheticEventReadService().getSourceEnvelopeById(id);
    return item
      ? jsonResponse(
          request,
          sourceEnvelopeSchema.parse(item),
          200,
          "source_envelopes.read",
        )
      : jsonResponse(
          request,
          { code: "NOT_FOUND", message: "Source envelope not found" },
          404,
          "source_envelopes.not_found",
        );
  } catch (error) {
    return syntheticEventFailure(request, error, "source_envelopes.read");
  }
}
