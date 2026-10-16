import { and, eq } from "drizzle-orm";
import { CaptureError } from "@commandry/domain";
import type { FoundationTransaction } from "./foundation-record-repository";
import { capture, knowledgeItem } from "./schema";

/** Transaction-local canonical conversion. Callers own locked provenance and
 * authorization checks; no transport may supply or select this operation. */
export async function fileCaptureNoteInTransaction(
  tx: FoundationTransaction,
  input: {
    captureId: string;
    recordId: string;
    projectId: string;
    title: string;
    content: string;
    at: Date;
  },
) {
  const [updated] = await tx
    .update(capture)
    .set({
      state: "filed",
      projectId: input.projectId,
      filedRecordKind: "note",
      filedRecordId: input.recordId,
      filedAt: input.at,
    })
    .where(and(eq(capture.id, input.captureId), eq(capture.state, "unfiled")))
    .returning();
  if (!updated)
    throw new CaptureError("CAPTURE_ALREADY_FILED", "Capture is already filed");
  const [record] = await tx
    .insert(knowledgeItem)
    .values({
      id: input.recordId,
      projectId: input.projectId,
      sourceCaptureId: input.captureId,
      title: input.title,
      kind: "note",
      content: input.content,
      createdAt: input.at,
      updatedAt: input.at,
    })
    .returning();
  if (!record) throw new Error("Note filing returned no row");
  return { capture: updated, record };
}
