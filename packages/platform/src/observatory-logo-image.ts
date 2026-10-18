import {
  ObservatoryLogoError,
  type ObservatoryLogoMediaType,
  type ObservatoryLogoProcessor,
} from "@commandry/application";
import { OBSERVATORY_LOGO_SIZE } from "@commandry/contracts";

/** Decoded or rendered size bound, checked before pixels are allocated. */
const maximumInputPixels = 4096 * 4096;
const timeoutSeconds = 5;
type Sharp = (typeof import("sharp"))["default"];

/**
 * Rasterize an already sniffed logo to the canonical transparent PNG.
 * sharp is loaded on first use, so a process that never rasterizes (the
 * worker image omits optional native packages) never needs libvips.
 * The input is a buffer with no base path, so SVG cannot resolve outside files.
 */
export function createObservatoryLogoProcessor(
  options: { load?: () => Promise<Sharp> } = {},
): ObservatoryLogoProcessor {
  let loaded: Promise<Sharp> | undefined;
  const load =
    options.load ?? (() => import("sharp").then((module) => module.default));
  // A missing native library is an operational fault, not a bad image.
  const library = () =>
    (loaded ??= load().catch((error: unknown) => {
      loaded = undefined;
      throw error;
    })).catch(() => {
      throw new ObservatoryLogoError("LOGO_PROCESSING_UNAVAILABLE");
    });
  return {
    async rasterize({
      bytes,
      mediaType,
    }: {
      bytes: Uint8Array;
      mediaType: ObservatoryLogoMediaType;
    }) {
      const sharp = await library();
      const input = Buffer.from(
        bytes.buffer,
        bytes.byteOffset,
        bytes.byteLength,
      );
      const options = {
        limitInputPixels: maximumInputPixels,
        failOn: "error",
        pages: 1,
      } as const;
      let density: number | undefined;
      if (mediaType === "image/svg+xml") {
        // Render vector input at twice the badge size before downscaling.
        const metadata = await sharp(input, options).metadata();
        const largest = Math.max(metadata.width ?? 0, metadata.height ?? 0);
        if (!Number.isFinite(largest) || largest <= 0)
          throw new Error("SVG has no intrinsic size");
        density = Math.min(
          2400,
          Math.max(1, Math.ceil((72 * OBSERVATORY_LOGO_SIZE * 2) / largest)),
        );
      }
      const output = await sharp(input, {
        ...options,
        ...(density === undefined ? {} : { density }),
      })
        .timeout({ seconds: timeoutSeconds })
        .rotate()
        .resize(OBSERVATORY_LOGO_SIZE, OBSERVATORY_LOGO_SIZE, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .ensureAlpha()
        .png({ compressionLevel: 9, palette: false })
        .toBuffer();
      return new Uint8Array(
        output.buffer,
        output.byteOffset,
        output.byteLength,
      );
    },
  };
}
