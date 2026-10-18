import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import {
  sniffObservatoryLogo,
  validateObservatoryLogoPng,
} from "@commandry/application";
import { createObservatoryLogoProcessor } from "./observatory-logo-image";

const processor = createObservatoryLogoProcessor();
const raster = (format: "png" | "jpeg" | "webp", width = 300, height = 150) =>
  sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 220, g: 40, b: 90, alpha: 1 },
    },
  })
    .toFormat(format)
    .toBuffer()
    .then((buffer) => new Uint8Array(buffer));
const svg = (body: string) => new TextEncoder().encode(body);
async function rasterize(bytes: Uint8Array) {
  const png = await processor.rasterize({
    bytes,
    mediaType: sniffObservatoryLogo(bytes),
  });
  validateObservatoryLogoPng(png);
  return png;
}

describe("Observatory logo rasterization", () => {
  it.each(["png", "jpeg", "webp"] as const)(
    "turns %s input into one transparent 128px PNG without metadata",
    async (format) => {
      const png = await rasterize(await raster(format));
      const metadata = await sharp(png).metadata();
      expect(metadata).toMatchObject({
        format: "png",
        width: 128,
        height: 128,
        hasAlpha: true,
      });
      expect(metadata.exif).toBeUndefined();
      expect(metadata.icc).toBeUndefined();
      // A wide 2:1 input is letterboxed; the corners stay transparent.
      const { data } = await sharp(png)
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect(data[3]).toBe(0);
      expect(data[(64 * 128 + 64) * 4 + 3]).toBe(255);
    },
  );

  it("renders a viewBox-only SVG at badge size", async () => {
    const png = await rasterize(
      svg(
        '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><linearGradient id="g"><stop offset="0" stop-color="#0af"/></linearGradient></defs><circle cx="12" cy="12" r="10" fill="url(#g)"/></svg>',
      ),
    );
    expect(await sharp(png).metadata()).toMatchObject({
      width: 128,
      height: 128,
    });
  });

  it("is deterministic, so a review can match the previewed digest", async () => {
    const input = await raster("jpeg");
    expect(Buffer.from(await rasterize(input))).toEqual(
      Buffer.from(await rasterize(input)),
    );
  });

  it("refuses an image whose decoded size exceeds the pixel bound", async () => {
    const huge = await sharp({
      create: {
        width: 5000,
        height: 4000,
        channels: 3,
        background: "#ffffff",
      },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    await expect(
      processor.rasterize({
        bytes: new Uint8Array(huge),
        mediaType: "image/png",
      }),
    ).rejects.toThrow();
  });

  it("refuses truncated input instead of rendering a partial image", async () => {
    const png = await raster("png", 512, 512);
    await expect(
      processor.rasterize({
        bytes: png.subarray(0, Math.floor(png.length / 2)),
        mediaType: "image/png",
      }),
    ).rejects.toThrow();
  });

  it("never resolves an outside reference even if one reached the renderer", async () => {
    // The sniffer refuses this first; the processor alone still renders from a
    // buffer without a base path, so the reference cannot load.
    const outside = svg(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="10" height="10"><image width="10" height="10" xlink:href="file:///etc/hostname"/></svg>',
    );
    expect(() => sniffObservatoryLogo(outside)).toThrow(
      "LOGO_UNSUPPORTED_IMAGE",
    );
    const png = await processor.rasterize({
      bytes: outside,
      mediaType: "image/svg+xml",
    });
    const { data } = await sharp(png)
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(data.every((value, index) => index % 4 !== 3 || value === 0)).toBe(
      true,
    );
  });
});

describe("Observatory logo rasterizer availability", () => {
  it("reports a missing image library as unavailable processing, then retries the load", async () => {
    const load = vi
      .fn<() => Promise<typeof sharp>>()
      .mockRejectedValueOnce(
        new Error("Cannot find module '@img/sharp-linux-x64'"),
      )
      .mockResolvedValueOnce(sharp);
    const processor = createObservatoryLogoProcessor({ load });
    const bytes = await raster("png", 16, 16);
    await expect(
      processor.rasterize({ bytes, mediaType: "image/png" }),
    ).rejects.toMatchObject({ code: "LOGO_PROCESSING_UNAVAILABLE" });
    const png = await processor.rasterize({ bytes, mediaType: "image/png" });
    expect((await sharp(png).metadata()).width).toBe(128);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
