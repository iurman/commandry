import { FOUNDATION_IMPORT_MAX_BYTES } from "@commandry/contracts";

export const FOUNDATION_IMPORT_BODY_BYTES = FOUNDATION_IMPORT_MAX_BYTES;

export class FoundationImportBodyError extends Error {
  constructor(
    readonly code: "INVALID_INPUT" | "PAYLOAD_TOO_LARGE",
    readonly status: 400 | 413,
  ) {
    super("Selected import request is unavailable");
  }
}

/** Bound physical request bytes before parsing; canonical application admission
 * is separate. Never decode invalid UTF8 into replacement characters. */
export async function foundationImportBody(
  request: Request,
  maximumBytes: number = FOUNDATION_IMPORT_BODY_BYTES,
): Promise<unknown> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1)
    throw new Error("A bounded foundation request limit is required");
  if (
    request.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase() !== "application/json"
  ) {
    throw new FoundationImportBodyError("INVALID_INPUT", 400);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new FoundationImportBodyError("INVALID_INPUT", 400);
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maximumBytes) {
        throw new FoundationImportBodyError("PAYLOAD_TOO_LARGE", 413);
      }
      chunks.push(chunk.value);
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(chunks, bytes),
    );
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof FoundationImportBodyError) throw error;
    throw new FoundationImportBodyError("INVALID_INPUT", 400);
  } finally {
    // Provider cleanup must not delay the safe rejection or leak a stream
    // message. A cancellation promise can remain pending after the stream closes.
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
