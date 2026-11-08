import { z } from "zod";
import { loadRuntimeConfig } from "@commandry/config";
import { acceptMailWebhook } from "@commandry/db";
import { verifyResendMailWebhook } from "@commandry/platform";
import { getDatabase } from "../../../../../../lib/database";
import { mailFailure } from "../../../../../../lib/email";
import { jsonResponse } from "../../../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  context: { params: Promise<{ accountId: string }> },
) {
  try {
    const accountId = z.uuid().parse((await context.params).accountId);
    // Bound raw bytes before verification. Never JSON-parse and reserialize a signed payload.
    const reader = request.body?.getReader();
    if (!reader) return jsonResponse(request, { code: "INVALID_INPUT" }, 400);
    const parts: Uint8Array[] = [];
    let bytes = 0;
    try {
      for (;;) {
        const item = await reader.read();
        if (item.done) break;
        bytes += item.value.byteLength;
        if (bytes > 262144) {
          await reader.cancel();
          return jsonResponse(request, { code: "INPUT_TOO_LARGE" }, 413);
        }
        parts.push(item.value);
      }
    } finally {
      reader.releaseLock();
    }
    const raw = new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(parts),
    );
    const event = await verifyResendMailWebhook(
      raw,
      request.headers,
      loadRuntimeConfig().mailResendWebhookSecretFile,
    );
    if (event)
      await acceptMailWebhook(getDatabase().db, { accountId, raw, ...event });
    return jsonResponse(
      request,
      { accepted: true },
      200,
      "mail.webhook.accepted",
    );
  } catch (error) {
    return mailFailure(request, error);
  }
}
