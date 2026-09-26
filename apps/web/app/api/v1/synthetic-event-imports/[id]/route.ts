import { loadRuntimeConfig } from "@commandry/config";
import { syntheticEventImportSchema } from "@commandry/contracts";
import { z } from "zod";
import {
  getSyntheticEventReadService,
  syntheticEventFailure,
} from "../../../../../lib/events";
import { jsonResponse } from "../../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  loadRuntimeConfig();
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success)
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "Invalid import ID" },
      400,
      "synthetic_import.invalid_id",
    );
  try {
    const item = await getSyntheticEventReadService().getImportById(id);
    return item
      ? jsonResponse(
          request,
          syntheticEventImportSchema.parse(item),
          200,
          "synthetic_import.read",
        )
      : jsonResponse(
          request,
          { code: "NOT_FOUND", message: "Synthetic import not found" },
          404,
          "synthetic_import.not_found",
        );
  } catch (error) {
    return syntheticEventFailure(request, error, "synthetic_import.read");
  }
}
