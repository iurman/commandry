import { eq } from "drizzle-orm";
import type { CommandryDatabase } from "./client";
import { captureRecord } from "./capture-repository";
import { capture, captureFile } from "./schema";

export function createFileCaptureRepository(db: CommandryDatabase) {
  return {
    async create(input: {
      captureId: string;
      originalName: string;
      mediaType: string;
      byteSize: number;
      sha256: string;
      contentBase64: string;
    }) {
      return db.transaction(async (tx) => {
        const [source] = await tx
          .insert(capture)
          .values({
            id: input.captureId,
            inputType: "file",
            originalContent: `capture-file://${input.captureId}`,
            source: "manual-local",
            author: "local-user",
          })
          .returning();
        if (!source) throw new Error("File capture insert returned no row");
        const [file] = await tx.insert(captureFile).values(input).returning();
        if (!file) throw new Error("Original file insert returned no row");
        return captureRecord(source, file);
      });
    },
    async getOriginal(id: string) {
      const [file] = await db
        .select()
        .from(captureFile)
        .where(eq(captureFile.captureId, id))
        .limit(1);
      return file
        ? {
            originalName: file.originalName,
            mediaType: file.mediaType,
            byteSize: file.byteSize,
            sha256: file.sha256,
            contentBase64: file.contentBase64,
          }
        : null;
    },
  };
}
