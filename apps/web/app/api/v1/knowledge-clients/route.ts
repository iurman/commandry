import {
  createKnowledgeClientSchema,
  createdKnowledgeClientSchema,
  knowledgeAccessPageSchema,
  listKnowledgeClientsSchema,
} from "@commandry/contracts";
import {
  getKnowledgeAccessService,
  knowledgeOwner,
  knowledgeFailure,
} from "../../../../lib/knowledge-access";
import { realIntegrationBody } from "../../../../lib/real-integrations";
import { jsonResponse } from "../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await knowledgeOwner(request);
    const input = knowledgeAccessPageSchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!input.success)
      return jsonResponse(request, { code: "INVALID_QUERY" }, 400);
    return jsonResponse(
      request,
      listKnowledgeClientsSchema.parse(
        await getKnowledgeAccessService().list(input.data),
      ),
    );
  } catch (error) {
    return knowledgeFailure(request, error);
  }
}
export async function POST(request: Request) {
  try {
    const actor = await knowledgeOwner(request);
    let body: unknown;
    try {
      body = await realIntegrationBody(request);
    } catch {
      return jsonResponse(
        request,
        { code: "INVALID_BODY", message: "Bounded JSON body required" },
        400,
      );
    }
    const input = createKnowledgeClientSchema.safeParse(body);
    if (!input.success)
      return jsonResponse(request, { code: "INVALID_BODY" }, 400);
    return jsonResponse(
      request,
      createdKnowledgeClientSchema.parse(
        await getKnowledgeAccessService().create(input.data, actor),
      ),
      201,
      "knowledge_client.created",
    );
  } catch (error) {
    return knowledgeFailure(request, error);
  }
}
