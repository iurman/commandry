import { z } from "zod";
import {
  OBSERVATORY_LOGO_SIZE,
  observatoryLogoReferenceSchema,
  observatoryProvenanceSchema,
} from "./observatory";
import { observatorySceneQuerySchema } from "./observatory-queries";

/** Safe owner-facing logo failure codes returned by preview and review. */
export const observatoryLogoFailureCodeSchema = z.enum([
  "LOGO_UNSUPPORTED_IMAGE",
  "LOGO_TOO_LARGE",
  "LOGO_REPOSITORY_NOT_REVIEWED",
  "LOGO_SOURCE_NOT_FOUND",
  "LOGO_SOURCE_UNAUTHORIZED",
  "LOGO_SOURCE_UNAVAILABLE",
  "LOGO_PROCESSING_UNAVAILABLE",
]);
export const observatoryLogoFailureSchema = z.strictObject({
  code: observatoryLogoFailureCodeSchema,
});
/** Original input bound before decoding; the processed PNG is always smaller. */
export const OBSERVATORY_LOGO_MAX_INPUT_BYTES = 524288;
const identity = z.uuid().toLowerCase();
const sha256 = observatoryLogoReferenceSchema.shape.digest;
const gitSha = z.string().regex(/^[a-f0-9]{40}$/);
const segments = (value: string) => value.split("/");
/** Same reviewed owner/name syntax as a github-repository source binding. */
export const observatoryLogoRepositorySchema = z
  .string()
  .max(200)
  .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)
  .refine(
    (value) => !segments(value).some((part) => part === "." || part === ".."),
    "Invalid repository identity",
  );
/** A relative file path inside the repository; never a URL or traversal. */
export const observatoryLogoPathSchema = z
  .string()
  .min(1)
  .max(300)
  .regex(/^[A-Za-z0-9_.@+-]+(?:\/[A-Za-z0-9_.@+-]+)*$/)
  .refine(
    (value) => !segments(value).some((part) => part === "." || part === ".."),
    "Invalid repository path",
  );
const ref = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/)
  .refine(
    (value) =>
      !value.includes("..") && !value.endsWith(".lock") && value !== "HEAD",
    "Invalid ref",
  );
const fileName = z
  .string()
  .min(1)
  .max(255)
  .refine(
    (value) =>
      value.trim().length > 0 && !/[/\\\u0000-\u001f\u007f]/.test(value),
    "Invalid file name",
  );
const upload = z.strictObject({
  kind: z.literal("upload"),
  fileName,
  dataBase64: z
    .string()
    .min(4)
    .max(Math.ceil(OBSERVATORY_LOGO_MAX_INPUT_BYTES / 3) * 4)
    .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
});
export const observatoryLogoPreviewInputSchema = z.discriminatedUnion("kind", [
  upload,
  z.strictObject({
    kind: z.literal("repository_file"),
    repository: observatoryLogoRepositorySchema,
    path: observatoryLogoPathSchema,
    /** Branch or tag; null reads the repository's default branch. */
    ref: ref.nullable(),
  }),
]);
/** A review names the exact commit its preview resolved. */
export const observatoryLogoReviewInputSchema = z.discriminatedUnion("kind", [
  upload,
  z.strictObject({
    kind: z.literal("repository_file"),
    repository: observatoryLogoRepositorySchema,
    path: observatoryLogoPathSchema,
    commitSha: gitSha,
  }),
]);
export const observatoryLogoOriginalMediaTypeSchema = z.enum([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);
const original = {
  originalMediaType: observatoryLogoOriginalMediaTypeSchema,
  originalByteLength: z
    .number()
    .int()
    .positive()
    .max(OBSERVATORY_LOGO_MAX_INPUT_BYTES),
  originalDigest: sha256,
};
/** Where the processed image came from. Never contains the original bytes. */
export const observatoryLogoSourceSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("upload"), fileName, ...original }),
  z.strictObject({
    kind: z.literal("repository_file"),
    repository: observatoryLogoRepositorySchema,
    path: observatoryLogoPathSchema,
    commitSha: gitSha,
    blobSha: gitSha,
    ...original,
  }),
]);
const review = z.strictObject({
  evidenceRefs: z
    .array(
      z
        .string()
        .min(1)
        .max(2000)
        .refine(
          (value) => value.trim().length > 0,
          "Evidence reference must not be blank",
        ),
    )
    .min(1),
  note: z.string().trim().min(1).max(4000),
});
export const observatoryLogoPreviewSchema = z.strictObject({
  resourceId: identity,
  input: observatoryLogoPreviewInputSchema,
});
export const observatoryLogoChangeSchema = z
  .strictObject({
    expectedVersion: z.number().int().nonnegative(),
    resourceId: identity,
    active: z.boolean(),
    /** Digest of the processed PNG the owner saw in the preview. */
    expectedDigest: sha256.nullable(),
    input: observatoryLogoReviewInputSchema.nullable(),
    review,
  })
  .refine(
    (value) =>
      value.active
        ? value.input !== null && value.expectedDigest !== null
        : value.input === null && value.expectedDigest === null,
    "Approval needs a previewed input and digest; retiring takes neither",
  );
export const observatoryLogoImageSchema = z.strictObject({
  digest: sha256,
  mediaType: z.literal("image/png"),
  width: z.literal(OBSERVATORY_LOGO_SIZE),
  height: z.literal(OBSERVATORY_LOGO_SIZE),
  dataBase64: z.string().min(4),
});
export const observatoryLogoPreviewResultSchema = z.strictObject({
  schemaVersion: z.literal(1),
  resourceId: identity,
  image: observatoryLogoImageSchema,
  source: observatoryLogoSourceSchema,
});
export const observatoryLogoQuerySchema = observatorySceneQuerySchema.extend({
  resourceId: identity,
  digest: sha256,
});
export const observatoryLogoReadResultSchema = z.strictObject({
  schemaVersion: z.literal(1),
  scopeDigest: z.string().min(1).max(500),
  resourceId: identity,
  version: observatoryLogoReferenceSchema.shape.version,
  image: observatoryLogoImageSchema,
});
export const observatoryLogoCatalogueItemSchema = z
  .strictObject({
    kind: z.literal("logo"),
    id: z.uuid(),
    resourceId: z.uuid(),
    version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    active: z.boolean(),
    digest: sha256,
    mediaType: z.literal("image/png"),
    width: z.literal(OBSERVATORY_LOGO_SIZE),
    height: z.literal(OBSERVATORY_LOGO_SIZE),
    source: observatoryLogoSourceSchema,
    provenance: observatoryProvenanceSchema.refine(
      (value) =>
        value.evidenceRefs.every((reference) => reference.trim().length > 0),
      "Evidence references must not be blank",
    ),
  })
  .refine(
    (value) => value.id === value.resourceId,
    "Logo identity must match its resource",
  );

export type ObservatoryLogoFailureCode = z.infer<
  typeof observatoryLogoFailureCodeSchema
>;
export type ObservatoryLogoPreview = z.infer<
  typeof observatoryLogoPreviewSchema
>;
export type ObservatoryLogoPreviewInput = z.infer<
  typeof observatoryLogoPreviewInputSchema
>;
export type ObservatoryLogoReviewInput = z.infer<
  typeof observatoryLogoReviewInputSchema
>;
export type ObservatoryLogoChange = z.infer<typeof observatoryLogoChangeSchema>;
export type ObservatoryLogoSource = z.infer<typeof observatoryLogoSourceSchema>;
export type ObservatoryLogoImage = z.infer<typeof observatoryLogoImageSchema>;
export type ObservatoryLogoPreviewResult = z.infer<
  typeof observatoryLogoPreviewResultSchema
>;
export type ObservatoryLogoQuery = z.infer<typeof observatoryLogoQuerySchema>;
export type ObservatoryLogoReadResult = z.infer<
  typeof observatoryLogoReadResultSchema
>;
export type ObservatoryLogoReference = z.infer<
  typeof observatoryLogoReferenceSchema
>;
