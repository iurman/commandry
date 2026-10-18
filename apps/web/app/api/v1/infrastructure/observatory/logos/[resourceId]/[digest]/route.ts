import { observatoryLogoQuerySchema } from "@commandry/contracts";
import { FoundationError } from "@commandry/domain";
import { observatoryOwnerRead } from "../../../../../../../../lib/observatory";
import { foundationFailure } from "../../../../../../../../lib/foundation-access";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * Badge image for an approved logo. The same authorized owner read as the
 * POST logo operation; the path names the content digest, so the response is
 * immutable. Cross-site embedding is refused before any read.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ resourceId: string; digest: string }> },
): Promise<Response> {
  try {
    const site = request.headers.get("sec-fetch-site");
    if (site !== null && site !== "same-origin" && site !== "none")
      throw new FoundationError(
        "FORBIDDEN",
        "Same-origin image request required",
      );
    const { resourceId, digest } = await context.params;
    const projectId = new URL(request.url).searchParams.get("projectId");
    const query = observatoryLogoQuerySchema.parse({
      resourceId,
      digest,
      ...(projectId ? { projectId } : {}),
    });
    const { service, context: owner } = await observatoryOwnerRead(
      request,
      query.projectId,
    );
    const result = await service.logo(owner, query);
    const bytes = Buffer.from(result.image.dataBase64, "base64");
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "content-type": "image/png",
        "content-length": String(bytes.byteLength),
        "x-frame-options": "DENY",
        "cache-control": "private, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; sandbox",
        "cross-origin-resource-policy": "same-origin",
      },
    });
  } catch (error) {
    return foundationFailure(request, error);
  }
}
