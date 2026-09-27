import {
  localAttentionSettingsSchema,
  updateLocalAttentionSettingsRequestSchema,
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
    "attention_rules.read",
  );
  if (modeFailure) return modeFailure;
  try {
    const settings = await getLocalAttentionService().getSettings();
    return jsonResponse(
      request,
      localAttentionSettingsSchema.parse(settings),
      200,
      "attention_rules.read",
    );
  } catch (error) {
    return localAttentionFailure(request, error, "attention_rules.read");
  }
}

export async function PATCH(request: Request): Promise<Response> {
  const modeFailure = localAttentionModeFailure(
    request,
    "attention_rules.update",
  );
  if (modeFailure) return modeFailure;
  const parsed = updateLocalAttentionSettingsRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid local attention rules" },
      400,
      "attention_rules.invalid_body",
    );
  try {
    const settings = await getLocalAttentionService().updateSettings(
      parsed.data,
    );
    return jsonResponse(
      request,
      localAttentionSettingsSchema.parse(settings),
      200,
      "attention_rules.updated",
    );
  } catch (error) {
    return localAttentionFailure(request, error, "attention_rules.update");
  }
}
