import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  localFileTextProjectionSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../../lib/http";
import { getLocalFileTextService } from "../../../../../../lib/local-file-text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  loadRuntimeConfig();
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success)
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "A valid capture ID is required" },
      400,
      "file_text.invalid_id",
    );
  try {
    const projection = await getLocalFileTextService().get(id);
    return projection
      ? jsonResponse(
          request,
          localFileTextProjectionSchema.parse(projection),
          200,
          "file_text.read",
        )
      : jsonResponse(
          request,
          { code: "NOT_FOUND", message: "File text projection not found" },
          404,
          "file_text.not_found",
        );
  } catch {
    return jsonResponse(
      request,
      { code: "DATABASE_UNAVAILABLE", message: "File text is unavailable" },
      503,
      "file_text.unavailable",
    );
  }
}
