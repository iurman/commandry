import { loadRuntimeConfig } from "@commandry/config";
import {
  listAttentionQuerySchema,
  listAttentionResponseSchema,
} from "@commandry/contracts";
import {
  getSyntheticEventReadService,
  syntheticEventFailure,
} from "../../../../lib/events";
import { jsonResponse } from "../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  loadRuntimeConfig();
  const parsed = listAttentionQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid attention page query" },
      400,
      "attention.invalid_query",
    );
  try {
    const page = await getSyntheticEventReadService().listAttention(
      parsed.data,
    );
    return jsonResponse(
      request,
      listAttentionResponseSchema.parse(page),
      200,
      "attention.list",
    );
  } catch (error) {
    return syntheticEventFailure(request, error, "attention.list");
  }
}
