import { z } from "zod";
import { ownerMail, mailFailure } from "../../../../../lib/email";
import {
  readObservatoryJson,
  ObservatoryBodyTooLarge,
} from "../../../../../lib/observatory-http";
import { jsonResponse } from "../../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const operationSchema = z.enum([
  "accounts",
  "inboxes",
  "messages",
  "overview",
  "read",
  "attachments",
  "drafts",
  "draft",
  "triage",
  "rules",
  "getRules",
  "account",
  "approve",
  "send",
]);
export async function POST(
  request: Request,
  context: { params: Promise<{ operation: string }> },
) {
  try {
    const operation = operationSchema.parse((await context.params).operation);
    // Establish owner authority before parsing any mail input.
    const { foundationOwnerIdentity } =
      await import("../../../../../lib/foundation-access");
    await foundationOwnerIdentity(request);
    return jsonResponse(
      request,
      await ownerMail(request, operation, await readObservatoryJson(request)),
      200,
      "mail." + operation,
    );
  } catch (error) {
    if (error instanceof ObservatoryBodyTooLarge)
      return jsonResponse(request, { code: "INPUT_TOO_LARGE" }, 413);
    if (error instanceof SyntaxError)
      return jsonResponse(request, { code: "INVALID_INPUT" }, 400);
    return mailFailure(request, error);
  }
}
