import { loadRuntimeConfig } from "@commandry/config";
import { createCaptureAndRequestTriage } from "@commandry/application";
import {
  captureSchema,
  createCaptureRequestSchema,
  listCapturesResponseSchema,
  listResourcesQuerySchema,
} from "@commandry/contracts";
import { captureFailure, getCaptureService } from "../../../../lib/capture";
import { getCaptureTriageService } from "../../../../lib/capture-triage";
import { jsonResponse } from "../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  loadRuntimeConfig();
  const parsed = listResourcesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid capture page query" },
      400,
      "captures.invalid_query",
    );
  }
  try {
    const page = await getCaptureService().listCaptures(parsed.data);
    return jsonResponse(
      request,
      listCapturesResponseSchema.parse(page),
      200,
      "captures.list",
    );
  } catch (error) {
    return captureFailure(request, error, "captures.list");
  }
}

export async function POST(request: Request): Promise<Response> {
  loadRuntimeConfig();
  const parsed = createCaptureRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid manual capture" },
      400,
      "captures.invalid_body",
    );
  }
  try {
    const { capture: created, triageQueued } =
      await createCaptureAndRequestTriage(
        getCaptureService().createCapture,
        async (id) => (await getCaptureTriageService()).requestSuggestion(id),
        parsed.data,
      );
    return jsonResponse(
      request,
      captureSchema.parse(created),
      201,
      triageQueued ? "captures.create" : "captures.create.triage_unavailable",
    );
  } catch (error) {
    return captureFailure(request, error, "captures.create");
  }
}
