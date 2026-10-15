import { z } from "zod";
import { knowledgeClientSchema } from "@commandry/contracts";
import {
  getKnowledgeAccessService,
  knowledgeOwner,
  knowledgeFailure,
} from "../../../../../../lib/knowledge-access";
import { jsonResponse } from "../../../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await knowledgeOwner(request);
    const id = z.uuid().safeParse((await context.params).id);
    if (!id.success) return jsonResponse(request, { code: "INVALID_ID" }, 400);
    return jsonResponse(
      request,
      knowledgeClientSchema.parse(
        await getKnowledgeAccessService().revoke(id.data, actor),
      ),
      200,
      "knowledge_client.revoked",
    );
  } catch (error) {
    return knowledgeFailure(request, error);
  }
}
