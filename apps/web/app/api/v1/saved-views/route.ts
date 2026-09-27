import { loadRuntimeConfig } from "@commandry/config";
import {
  createSavedViewRequestSchema,
  listSavedViewsQuerySchema,
  listSavedViewsResponseSchema,
  savedViewSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../lib/http";
import {
  getSavedViewService,
  savedViewFailure,
} from "../../../../lib/saved-views";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  loadRuntimeConfig();
  const parsed = listSavedViewsQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid saved view query" },
      400,
      "saved_views.invalid_query",
    );
  try {
    const page = await getSavedViewService().list(parsed.data);
    return jsonResponse(
      request,
      listSavedViewsResponseSchema.parse(page),
      200,
      "saved_views.list",
    );
  } catch (error) {
    return savedViewFailure(request, error, "saved_views.list");
  }
}

export async function POST(request: Request): Promise<Response> {
  loadRuntimeConfig();
  const parsed = createSavedViewRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid saved view" },
      400,
      "saved_views.invalid_body",
    );
  try {
    const view = await getSavedViewService().create(parsed.data);
    return jsonResponse(
      request,
      savedViewSchema.parse(view),
      201,
      "saved_views.created",
    );
  } catch (error) {
    return savedViewFailure(request, error, "saved_views.create");
  }
}
