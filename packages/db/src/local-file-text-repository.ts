import { and, eq, gt } from "drizzle-orm";
import type { CommandryDatabase } from "./client";
import { captureFile, captureFileText } from "./schema";

function record(row: typeof captureFileText.$inferSelect) {
  return {
    captureId: row.captureId,
    sourceSha256: row.sourceSha256,
    status: row.status,
    extractor: row.extractor as "local-utf8-v1",
    extractedText: row.extractedText,
    truncated: row.truncated,
    message: row.message,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function createLocalFileTextRepository(db: CommandryDatabase) {
  return {
    async get(captureId: string) {
      const [row] = await db
        .select()
        .from(captureFileText)
        .where(eq(captureFileText.captureId, captureId))
        .limit(1);
      return row ? record(row) : null;
    },
    async getSource(captureId: string) {
      const [row] = await db
        .select()
        .from(captureFile)
        .where(eq(captureFile.captureId, captureId))
        .limit(1);
      return row
        ? {
            originalName: row.originalName,
            mediaType: row.mediaType,
            byteSize: row.byteSize,
            sha256: row.sha256,
            contentBase64: row.contentBase64,
          }
        : null;
    },
    async listPending(limit: number, cursor?: string) {
      const rows = await db
        .select({ captureId: captureFileText.captureId })
        .from(captureFileText)
        .where(
          and(
            eq(captureFileText.status, "pending"),
            cursor ? gt(captureFileText.captureId, cursor) : undefined,
          ),
        )
        .orderBy(captureFileText.captureId)
        .limit(limit);
      return rows.map((row) => row.captureId);
    },
    async complete(input: {
      captureId: string;
      sourceSha256: string;
      status: "extracted" | "unsupported" | "failed";
      extractedText: string | null;
      truncated: boolean;
      message: string | null;
    }) {
      const [updated] = await db
        .update(captureFileText)
        .set({
          status: input.status,
          extractedText: input.extractedText,
          truncated: input.truncated,
          message: input.message,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(captureFileText.captureId, input.captureId),
            eq(captureFileText.sourceSha256, input.sourceSha256),
            eq(captureFileText.status, "pending"),
          ),
        )
        .returning();
      if (updated) return record(updated);
      const [existing] = await db
        .select()
        .from(captureFileText)
        .where(eq(captureFileText.captureId, input.captureId))
        .limit(1);
      if (!existing || existing.sourceSha256 !== input.sourceSha256)
        throw new Error("File text projection source changed");
      return record(existing);
    },
  };
}
