import { ownerMail, mailFailure } from "../../../../../../../lib/email";
import type { MailAttachment, MailPage } from "@commandry/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; attachmentId: string }> },
) {
  try {
    const params = await context.params;
    const result = (await ownerMail(
      request,
      "attachments",
      params,
    )) as MailPage<MailAttachment>;
    const url = result.items[0]?.downloadUrl;
    if (!url)
      return Response.json(
        { code: "UNAVAILABLE" },
        { status: 503, headers: { "cache-control": "no-store" } },
      );
    return new Response(null, {
      status: 303,
      headers: {
        location: url,
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
      },
    });
  } catch (error) {
    return mailFailure(request, error);
  }
}
