import { loadRuntimeConfig } from "@commandry/config";
import {
  createResourceDependencyRequestSchema,
  entityIdSchema,
  listResourceDependenciesQuerySchema,
  listResourceDependenciesResponseSchema,
  resourceDependencySchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../../lib/http";
import {
  getResourceTopologyService,
  resourceTopologyFailure,
} from "../../../../../../lib/resource-topology";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
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
      "resources.dependencies.invalid_id",
    );
  }
  const parsed = listResourceDependenciesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      {
        code: "INVALID_QUERY",
        message: "Invalid resource dependency page query",
      },
      400,
      "resources.dependencies.invalid_query",
    );
  }
  try {
    const page = await getResourceTopologyService().listDependencies(
      id,
      parsed.data,
    );
    return jsonResponse(
      request,
      listResourceDependenciesResponseSchema.parse(page),
      200,
      "resources.dependencies.list",
    );
  } catch (error) {
    return resourceTopologyFailure(
      request,
      error,
      "resources.dependencies.list",
    );
  }
}

export async function POST(
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
      "resources.dependencies.invalid_id",
    );
  }
  const parsed = createResourceDependencyRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid resource dependency" },
      400,
      "resources.dependencies.invalid_body",
    );
  }
  try {
    const link = await getResourceTopologyService().addDependency(
      id,
      parsed.data,
    );
    return jsonResponse(
      request,
      resourceDependencySchema.parse(link),
      201,
      "resources.dependencies.create",
    );
  } catch (error) {
    return resourceTopologyFailure(
      request,
      error,
      "resources.dependencies.create",
    );
  }
}
