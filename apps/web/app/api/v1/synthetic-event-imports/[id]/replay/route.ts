import { loadRuntimeConfig } from "@commandry/config";
import {
  syntheticFlowReplayQuerySchema,
  syntheticFlowReplaySchema,
} from "@commandry/contracts";
import { z } from "zod";
import { jsonResponse } from "../../../../../../lib/http";
import {
  getSyntheticFlowReplayService,
  syntheticFlowReplayFailure,
  syntheticFlowReplayModeFailure,
} from "../../../../../../lib/synthetic-flow-replay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  loadRuntimeConfig();
  const operation = "synthetic_flow_replay.get";
  const modeFailure = syntheticFlowReplayModeFailure(request, operation);
  if (modeFailure) return modeFailure;
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success)
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "Invalid import ID" },
      400,
      `${operation}.invalid_id`,
    );
  const query = syntheticFlowReplayQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid replay page query" },
      400,
      `${operation}.invalid_query`,
    );
  try {
    const replay = await (
      await getSyntheticFlowReplayService()
    ).get(id, query.data);
    if (!replay)
      return jsonResponse(
        request,
        { code: "NOT_FOUND", message: "Synthetic import not found" },
        404,
        `${operation}.not_found`,
      );
    return jsonResponse(
      request,
      syntheticFlowReplaySchema.parse(replay),
      200,
      operation,
    );
  } catch (error) {
    return syntheticFlowReplayFailure(request, error, operation);
  }
}
