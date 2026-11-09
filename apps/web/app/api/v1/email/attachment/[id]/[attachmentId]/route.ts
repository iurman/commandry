import { ownerMail, mailFailure } from "../../../../../../../lib/email";
import type { MailDownload } from "@commandry/application";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; attachmentId: string }> },
) {
  try {
    const params = await context.params;
    const result = (await ownerMail(request, "download", params)) as
      MailDownload | { redirect?: string };
    if ("body" in result)
      return new Response(result.body, {
        headers: {
          "content-type": result.contentType,
          "content-disposition": `${result.inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(result.filename).replace(/'/g, "%27")}`,
          "cache-control": "private, no-store",
          "x-content-type-options": "nosniff",
          "content-security-policy": "sandbox; default-src 'none'",
          "referrer-policy": "no-referrer",
        },
      });
    const url = result.redirect;
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
