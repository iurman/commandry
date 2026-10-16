import { and, eq } from "drizzle-orm";
import { CaptureError } from "@commandry/domain";
import type { FoundationTransaction } from "./foundation-record-repository";
import { capture, workItem } from "./schema";

/** Transaction-local canonical conversion. Callers own locked provenance and
 * authorization checks; no transport may supply or select this operation. */
export async function fileCaptureTaskInTransaction(
  tx: FoundationTransaction,
  input: {
    captureId: string;
    recordId: string;
    projectId: string;
    title: string;
    description: string;
    workType?: "task" | "initiative" | undefined;
    at: Date;
  },
) {
  const [updated] = await tx
    .update(capture)
    .set({
      state: "filed",
      projectId: input.projectId,
      filedRecordKind: "task",
      filedRecordId: input.recordId,
      filedAt: input.at,
    })
    .where(and(eq(capture.id, input.captureId), eq(capture.state, "unfiled")))
    .returning();
  if (!updated)
    throw new CaptureError("CAPTURE_ALREADY_FILED", "Capture is already filed");
  const [record] = await tx
    .insert(workItem)
    .values({
      id: input.recordId,
      projectId: input.projectId,
      sourceCaptureId: input.captureId,
      title: input.title,
      description: input.description,
      workType: input.workType ?? "task",
      createdAt: input.at,
      updatedAt: input.at,
    })
    .returning();
  if (!record) throw new Error("Work item insert returned no row");
  return { capture: updated, record };
}
