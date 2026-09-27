import {
  listLocalAttentionAuditResponseSchema,
  listResourcesQuerySchema,
} from "@commandry/contracts";
import {
  getLocalAttentionService,
  localAttentionFailure,
  localAttentionModeFailure,
} from "../../../../../lib/local-attention";
import { jsonResponse } from "../../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const modeFailure = localAttentionModeFailure(
    request,
    "attention_rules.audit",
  );
  if (modeFailure) return modeFailure;
  const query = listResourcesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid attention audit page query" },
      400,
      "attention_rules.invalid_audit_query",
    );
  try {
    const page = await getLocalAttentionService().listAudit(query.data);
    return jsonResponse(
      request,
      listLocalAttentionAuditResponseSchema.parse(page),
      200,
      "attention_rules.audit",
    );
  } catch (error) {
    return localAttentionFailure(request, error, "attention_rules.audit");
  }
}
