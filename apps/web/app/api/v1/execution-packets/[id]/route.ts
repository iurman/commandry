import { loadRuntimeConfig } from "@commandry/config";
import { entityIdSchema, executionPacketSchema } from "@commandry/contracts";
import {
  briefFailure,
  getExecutionPacketService,
} from "../../../../../lib/briefs";
import { jsonResponse } from "../../../../../lib/http";

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
      { code: "INVALID_ID", message: "A valid packet ID is required" },
      400,
      "execution_packet.invalid_id",
    );
  }
  try {
    const packet = await getExecutionPacketService().getById(id);
    return packet
      ? jsonResponse(
          request,
          executionPacketSchema.parse(packet),
          200,
          "execution_packet.read",
        )
      : jsonResponse(
          request,
          { code: "NOT_FOUND", message: "Execution packet not found" },
          404,
          "execution_packet.not_found",
        );
  } catch (error) {
    return briefFailure(request, error, "execution_packet.read");
  }
}
