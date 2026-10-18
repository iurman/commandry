import {
  ObservatoryLogoError,
  type ObservatoryLogoErrorCode,
} from "@commandry/application";
/** The limit bounds transport input, never the authorized inventory population. */
export class ObservatoryBodyTooLarge extends Error {
  constructor() {
    super("Observatory input exceeds the transport limit");
  }
}
export async function readObservatoryJson(
  request: Request,
  maximum = 262144,
): Promise<unknown> {
  const length = request.headers.get("content-length");
  if (length && /^\d+$/.test(length) && Number(length) > maximum) {
    await request.body?.cancel();
    throw new ObservatoryBodyTooLarge();
  }
  if (!request.body) throw new SyntaxError("JSON body required");
  const reader = request.body.getReader(),
    decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0,
    text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maximum) {
        await reader.cancel();
        throw new ObservatoryBodyTooLarge();
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    if (error instanceof ObservatoryBodyTooLarge) throw error;
    throw new SyntaxError("Invalid JSON body");
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(text);
}

/** Owner logo previews and reviews carry an image of up to 512 KiB as base64. */
export const OBSERVATORY_LOGO_BODY_BYTES = 786432;
const logoFailures: Record<ObservatoryLogoErrorCode, number> = {
  LOGO_UNSUPPORTED_IMAGE: 400,
  LOGO_REPOSITORY_NOT_REVIEWED: 400,
  LOGO_SOURCE_NOT_FOUND: 404,
  LOGO_TOO_LARGE: 413,
  LOGO_SOURCE_UNAUTHORIZED: 502,
  LOGO_SOURCE_UNAVAILABLE: 503,
  LOGO_PROCESSING_UNAVAILABLE: 503,
};
/** Safe owner-facing logo outcome; null when the error is not a logo failure. */
export function observatoryLogoFailure(
  error: unknown,
): { code: ObservatoryLogoErrorCode; status: number } | null {
  return error instanceof ObservatoryLogoError
    ? { code: error.code, status: logoFailures[error.code] }
    : null;
}
