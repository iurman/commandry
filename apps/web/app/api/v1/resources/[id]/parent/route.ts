import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  resourceSummarySchema,
  setResourceParentRequestSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../../lib/http";
import {
  getResourceTopologyService,
  resourceTopologyFailure,
} from "../../../../../../lib/resource-topology";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  loadRuntimeConfig();
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success) {
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "A valid resource ID is required" },
      400,
      "resources.parent.invalid_id",
    );
  }
  const parsed = setResourceParentRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid resource parent choice" },
      400,
      "resources.parent.invalid_body",
    );
  }
  try {
    const updated = await getResourceTopologyService().setParent(
      id,
      parsed.data,
    );
    return jsonResponse(
      request,
      resourceSummarySchema.parse(updated),
      200,
      "resources.parent.changed",
    );
  } catch (error) {
    return resourceTopologyFailure(request, error, "resources.parent.change");
  }
}
