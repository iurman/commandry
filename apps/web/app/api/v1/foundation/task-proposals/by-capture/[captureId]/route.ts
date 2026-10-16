import {
  foundationActorSchema,
  foundationTaskProposalDetailSchema,
} from "@commandry/contracts";
import { z } from "zod";
import {
  foundationFailure,
  foundationTaskProposalOwner,
} from "../../../../../../../lib/foundation-access";
import { jsonResponse } from "../../../../../../../lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const querySchema = z.strictObject({
  projectId: foundationActorSchema.shape.projectId,
});
export async function GET(
  request: Request,
  context: { params: Promise<{ captureId: string }> },
) {
  try {
    const owner = await foundationTaskProposalOwner(request);
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some((key) => params.getAll(key).length !== 1))
      return jsonResponse(request, { code: "INVALID_INPUT" }, 400);
    const query = querySchema.parse(Object.fromEntries(params));
    const captureId = foundationActorSchema.shape.projectId.parse(
      (await context.params).captureId,
    );
    const result = await owner.getTaskProposal({ ...query, captureId });
    const parsed = foundationTaskProposalDetailSchema.safeParse(result);
    if (
      !parsed.success ||
      parsed.data.capture.id !== captureId ||
      parsed.data.capture.projectId !== query.projectId
    )
      throw new Error("Task proposal response unavailable");
    return jsonResponse(
      request,
      parsed.data,
      200,
      "foundation.owner.taskProposal.read",
    );
  } catch (error) {
    return foundationFailure(request, error);
  }
}
