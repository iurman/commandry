import { loadRuntimeConfig } from "@commandry/config";
import {
  createSyntheticEventImportRequestSchema,
  listSyntheticEventImportsQuerySchema,
  listSyntheticEventImportsResponseSchema,
  syntheticEventImportSchema,
} from "@commandry/contracts";
import {
  getSyntheticEventImportService,
  getSyntheticEventReadService,
  syntheticEventFailure,
} from "../../../../lib/events";
import { jsonResponse } from "../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  loadRuntimeConfig();
  const parsed = listSyntheticEventImportsQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid import page query" },
      400,
      "synthetic_import.invalid_query",
    );
  try {
    const page = await getSyntheticEventReadService().listImports(parsed.data);
    return jsonResponse(
      request,
      listSyntheticEventImportsResponseSchema.parse(page),
      200,
      "synthetic_import.list",
    );
  } catch (error) {
    return syntheticEventFailure(request, error, "synthetic_import.list");
  }
}

export async function POST(request: Request): Promise<Response> {
  const config = loadRuntimeConfig();
  if (config.appEnv !== "local" && config.appEnv !== "test") {
    return jsonResponse(
      request,
      {
        code: "LOCAL_ONLY",
        message: "Synthetic imports are available only in local or test",
      },
      403,
      "synthetic_import.local_only",
    );
  }
  const parsed = createSyntheticEventImportRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid synthetic event import" },
      400,
      "synthetic_import.invalid_body",
    );
  try {
    const created = await (
      await getSyntheticEventImportService()
    ).submit(parsed.data);
    return jsonResponse(
      request,
      syntheticEventImportSchema.parse(created),
      202,
      "synthetic_import.submitted",
    );
  } catch (error) {
    return syntheticEventFailure(request, error, "synthetic_import.submit");
  }
}
