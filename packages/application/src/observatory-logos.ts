import { createHash } from "node:crypto";
import {
  OBSERVATORY_LOGO_MAX_INPUT_BYTES,
  OBSERVATORY_LOGO_SIZE,
  observatoryLogoChangeSchema,
  observatoryLogoPreviewResultSchema,
  observatoryLogoPreviewSchema,
  observatoryLogoSourceSchema,
  type ObservatoryLogoChange,
  type ObservatoryLogoPreviewInput,
  type ObservatoryLogoReviewInput,
  type ObservatoryLogoSource,
} from "@commandry/contracts";
import { FoundationError } from "@commandry/domain";
import type { ObservatoryOwnerIdentity } from "./observatory-management";

export type ObservatoryLogoMediaType =
  "image/png" | "image/jpeg" | "image/webp" | "image/svg+xml";
export type ObservatoryLogoErrorCode =
  | "LOGO_UNSUPPORTED_IMAGE"
  | "LOGO_TOO_LARGE"
  | "LOGO_REPOSITORY_NOT_REVIEWED"
  | "LOGO_SOURCE_NOT_FOUND"
  | "LOGO_SOURCE_UNAUTHORIZED"
  | "LOGO_SOURCE_UNAVAILABLE";
/** Safe, owner-facing outcome codes. No provider text or file content escapes. */
export class ObservatoryLogoError extends Error {
  constructor(public readonly code: ObservatoryLogoErrorCode) {
    super(code);
    this.name = "ObservatoryLogoError";
  }
}
/** Deterministic: identical bytes always produce identical PNG output. */
export interface ObservatoryLogoProcessor {
  rasterize(input: {
    bytes: Uint8Array;
    mediaType: ObservatoryLogoMediaType;
  }): Promise<Uint8Array>;
}
/** Fixed GitHub origin and server-held credential; callers choose only the file. */
export interface ObservatoryLogoRepositoryReader {
  readFile(input: {
    repository: string;
    path: string;
    /** Exactly one of ref or commitSha; a null ref means the default branch. */
    ref: string | null;
    commitSha: string | null;
  }): Promise<{ bytes: Uint8Array; commitSha: string; blobSha: string }>;
}
export type ObservatoryLogoStoredChange = {
  resourceId: string;
  expectedVersion: number;
  active: boolean;
  image: { png: Uint8Array; digest: string } | null;
  source: ObservatoryLogoSource | null;
  review: ObservatoryLogoChange["review"];
  /** Digest of the validated owner request, without repeating its bytes. */
  contentDigest: string;
};
export interface ObservatoryLogoPort {
  /** Hold the owner session, confirm a repository resource and return the
   * lower-case owner/name identities already reviewed for it. A non-null
   * preview is audited as observatory.logo.preview. */
  inspect(
    owner: ObservatoryOwnerIdentity,
    resourceId: string,
    preview: { sourceKind: ObservatoryLogoSource["kind"] } | null,
  ): Promise<{ repositories: readonly string[] }>;
  /** Recheck session, kind, version and repository identity in one audited write. */
  review(
    owner: ObservatoryOwnerIdentity,
    change: ObservatoryLogoStoredChange,
  ): Promise<{ id: string; version: number; auditId: string }>;
}

const sha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const unsupported = () => new ObservatoryLogoError("LOGO_UNSUPPORTED_IMAGE");
const starts = (bytes: Uint8Array, prefix: readonly number[], at = 0) =>
  prefix.every((value, index) => bytes[at + index] === value);
const ascii = (bytes: Uint8Array, at: number, text: string) =>
  starts(
    bytes,
    [...text].map((character) => character.charCodeAt(0)),
    at,
  );

/** Allow only same-document references and embedded raster data. */
function safeReference(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.startsWith("#") ||
    /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=\s]*$/.test(trimmed)
  );
}
/** Defence in depth before rasterizing: the renderer receives a buffer with no
 * base path, but declarations, scripts and outside references are refused. */
function validateSvg(bytes: Uint8Array): void {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw unsupported();
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const body = text
    .replace(/^\s*<\?xml\s[^>]*\?>/, "")
    .replace(/^(?:\s*<!--[\s\S]*?-->)*\s*/, "");
  if (!/^<svg[\s>]/.test(body) || text.includes("\u0000")) throw unsupported();
  if (
    /<!(?:DOCTYPE|ENTITY|ATTLIST|ELEMENT)/i.test(text) ||
    /<\?xml-stylesheet/i.test(text) ||
    /<(?:[A-Za-z_][\w.-]*:)?(?:script|foreignObject|iframe|object|embed|audio|video)\b/i.test(
      text,
    ) ||
    /@import/i.test(text)
  )
    throw unsupported();
  for (const match of text.matchAll(
    /\b(?:xlink:)?href\s*=\s*(?:"([^"]*)"|'([^']*)')/gi,
  ))
    if (!safeReference(match[1] ?? match[2] ?? "")) throw unsupported();
  // An unquoted or unusual href form is refused rather than interpreted.
  if (/\b(?:xlink:)?href\s*=\s*[^\s"']/i.test(text)) throw unsupported();
  for (const match of text.matchAll(
    /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\)/gi,
  ))
    if (!safeReference(match[1] ?? match[2] ?? match[3] ?? ""))
      throw unsupported();
}
/** Identify the input by its bytes, never by a file name or declared type. */
export function sniffObservatoryLogo(
  bytes: Uint8Array,
): ObservatoryLogoMediaType {
  if (bytes.byteLength > OBSERVATORY_LOGO_MAX_INPUT_BYTES)
    throw new ObservatoryLogoError("LOGO_TOO_LARGE");
  if (bytes.byteLength < 12) throw unsupported();
  if (starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return "image/png";
  if (starts(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WEBP")) return "image/webp";
  validateSvg(bytes);
  return "image/svg+xml";
}
/** The processor's output must be exactly the canonical badge image. */
export function validateObservatoryLogoPng(png: Uint8Array): void {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  if (
    png.byteLength < 33 ||
    png.byteLength > 262144 ||
    !starts(png, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ||
    view.getUint32(8) !== 13 ||
    !ascii(png, 12, "IHDR") ||
    view.getUint32(16) !== OBSERVATORY_LOGO_SIZE ||
    view.getUint32(20) !== OBSERVATORY_LOGO_SIZE
  )
    throw unsupported();
}
function decode(dataBase64: string): Uint8Array {
  const bytes = Buffer.from(dataBase64, "base64");
  if (bytes.toString("base64") !== dataBase64) throw unsupported();
  return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/**
 * Owner logo preview and review. Preview writes nothing; review processes the
 * same source again and stores it only if it still matches what the owner saw.
 */
export function createObservatoryLogoService(dependencies: {
  port: ObservatoryLogoPort;
  processor: ObservatoryLogoProcessor;
  repositoryReader?: ObservatoryLogoRepositoryReader;
}) {
  const { port, processor, repositoryReader } = dependencies;
  async function obtain(
    input: ObservatoryLogoPreviewInput | ObservatoryLogoReviewInput,
    repositories: readonly string[],
  ) {
    let bytes: Uint8Array;
    let origin:
      | { kind: "upload"; fileName: string }
      | {
          kind: "repository_file";
          repository: string;
          path: string;
          commitSha: string;
          blobSha: string;
        };
    if (input.kind === "upload") {
      bytes = decode(input.dataBase64);
      origin = { kind: "upload", fileName: input.fileName };
    } else {
      if (!repositories.includes(input.repository.toLowerCase()))
        throw new ObservatoryLogoError("LOGO_REPOSITORY_NOT_REVIEWED");
      if (!repositoryReader)
        throw new ObservatoryLogoError("LOGO_SOURCE_UNAVAILABLE");
      const pinned = "commitSha" in input ? input.commitSha : null;
      const file = await repositoryReader.readFile({
        repository: input.repository,
        path: input.path,
        ref: "ref" in input ? input.ref : null,
        commitSha: pinned,
      });
      if (
        !/^[a-f0-9]{40}$/.test(file.commitSha) ||
        !/^[a-f0-9]{40}$/.test(file.blobSha) ||
        (pinned !== null && file.commitSha !== pinned)
      )
        throw new ObservatoryLogoError("LOGO_SOURCE_UNAVAILABLE");
      bytes = file.bytes;
      origin = {
        kind: "repository_file",
        repository: input.repository,
        path: input.path,
        commitSha: file.commitSha,
        blobSha: file.blobSha,
      };
    }
    const mediaType = sniffObservatoryLogo(bytes);
    let png: Uint8Array;
    try {
      png = await processor.rasterize({ bytes, mediaType });
    } catch (error) {
      if (error instanceof ObservatoryLogoError) throw error;
      throw unsupported();
    }
    validateObservatoryLogoPng(png);
    const source = observatoryLogoSourceSchema.parse({
      ...origin,
      originalMediaType: mediaType,
      originalByteLength: bytes.byteLength,
      originalDigest: sha256(bytes),
    });
    return { png, digest: sha256(png), source };
  }
  return {
    async preview(owner: ObservatoryOwnerIdentity, raw: unknown) {
      const request = observatoryLogoPreviewSchema.parse(raw);
      const { repositories } = await port.inspect(owner, request.resourceId, {
        sourceKind: request.input.kind,
      });
      const result = await obtain(request.input, repositories);
      return observatoryLogoPreviewResultSchema.parse({
        schemaVersion: 1,
        resourceId: request.resourceId,
        image: {
          digest: result.digest,
          mediaType: "image/png",
          width: OBSERVATORY_LOGO_SIZE,
          height: OBSERVATORY_LOGO_SIZE,
          dataBase64: Buffer.from(result.png).toString("base64"),
        },
        source: result.source,
      });
    },
    async review(owner: ObservatoryOwnerIdentity, raw: unknown) {
      const change = observatoryLogoChangeSchema.parse(raw);
      const contentDigest = createHash("sha256")
        .update(JSON.stringify(change))
        .digest("hex");
      if (!change.active || !change.input)
        return port.review(owner, {
          resourceId: change.resourceId,
          expectedVersion: change.expectedVersion,
          active: false,
          image: null,
          source: null,
          review: change.review,
          contentDigest,
        });
      const { repositories } = await port.inspect(
        owner,
        change.resourceId,
        null,
      );
      const result = await obtain(change.input, repositories);
      if (result.digest !== change.expectedDigest)
        throw new FoundationError(
          "VERSION_CONFLICT",
          "Logo content changed; preview it again",
        );
      return port.review(owner, {
        resourceId: change.resourceId,
        expectedVersion: change.expectedVersion,
        active: true,
        image: { png: result.png, digest: result.digest },
        source: result.source,
        review: change.review,
        contentDigest,
      });
    },
  };
}
