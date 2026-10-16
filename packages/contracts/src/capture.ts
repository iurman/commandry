import { z } from "zod";

export const captureFileMetadataSchema = z.object({
  originalName: z.string().min(1),
  mediaType: z.string().min(1),
  byteSize: z.number().int().min(1).max(2_097_152),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  downloadHref: z.string().startsWith("/api/v1/captures/"),
  previewHref: z.string().startsWith("/api/v1/captures/").nullable().optional(),
});

export const captureSchema = z.object({
  id: z.uuid(),
  inputType: z.enum([
    "text",
    "email",
    "conversation",
    "voice_transcript",
    "url",
    "file",
  ]),
  originalContent: z.string(),
  file: captureFileMetadataSchema.nullable().optional(),
  source: z.enum(["manual-local", "automation-local-synthetic"]),
  author: z.enum(["local-user", "system:local-automation-worker"]),
  state: z.enum(["unfiled", "filed"]),
  projectId: z.uuid().nullable(),
  filedRecord: z
    .object({
      kind: z.enum(["task", "note", "link", "document"]),
      id: z.uuid(),
    })
    .nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  filedAt: z.iso.datetime({ offset: true }).nullable(),
});
