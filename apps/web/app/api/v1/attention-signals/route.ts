import {
  listLocalAttentionSignalsQuerySchema,
  listLocalAttentionSignalsResponseSchema,
} from "@commandry/contracts";
import {
  getLocalAttentionService,
  localAttentionFailure,
  localAttentionModeFailure,
} from "../../../../lib/local-attention";
import { jsonResponse } from "../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const modeFailure = localAttentionModeFailure(
    request,
    "attention_signals.list",
  );
  if (modeFailure) return modeFailure;
  const query = listLocalAttentionSignalsQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid attention signal page query" },
      400,
      "attention_signals.invalid_query",
    );
  try {
    const page = await getLocalAttentionService().listSignals(query.data);
    return jsonResponse(
      request,
      listLocalAttentionSignalsResponseSchema.parse(page),
      200,
      "attention_signals.list",
    );
  } catch (error) {
    return localAttentionFailure(request, error, "attention_signals.list");
  }
}
