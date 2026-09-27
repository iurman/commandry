import { expect, test } from "vitest";
import {
  LOCAL_FILE_CAPTURE_MAX_BYTES,
  localImagePreviewMediaType,
  validateLocalFileCapture,
} from "./file-capture";

test("local file capture validates bounded original metadata", () => {
  expect(
    validateLocalFileCapture({
      originalName: "Field notes.txt",
      mediaType: "text/plain",
      byteSize: LOCAL_FILE_CAPTURE_MAX_BYTES,
    }),
  ).toEqual({ originalName: "Field notes.txt", mediaType: "text/plain" });
  expect(
    validateLocalFileCapture({
      originalName: "unknown.bin",
      mediaType: "invalid media type",
      byteSize: 1,
    }).mediaType,
  ).toBe("application/octet-stream");
  for (const invalid of [
    { originalName: "empty.txt", mediaType: "text/plain", byteSize: 0 },
    {
      originalName: "large.txt",
      mediaType: "text/plain",
      byteSize: LOCAL_FILE_CAPTURE_MAX_BYTES + 1,
    },
    { originalName: "../escape.txt", mediaType: "text/plain", byteSize: 1 },
    { originalName: "line\nbreak.txt", mediaType: "text/plain", byteSize: 1 },
  ]) {
    expect(() => validateLocalFileCapture(invalid)).toThrow();
  }
});

test("local image preview accepts only matching raster signatures", () => {
  expect(
    localImagePreviewMediaType(
      "image/png",
      Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0]),
    ),
  ).toBe("image/png");
  expect(
    localImagePreviewMediaType(
      "image/jpeg",
      Uint8Array.from([255, 216, 255, 224]),
    ),
  ).toBe("image/jpeg");
  expect(
    localImagePreviewMediaType(
      "image/webp",
      Uint8Array.from([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]),
    ),
  ).toBe("image/webp");
  expect(
    localImagePreviewMediaType(
      "image/gif",
      Uint8Array.from([71, 73, 70, 56, 57, 97]),
    ),
  ).toBe("image/gif");
  expect(
    localImagePreviewMediaType("image/png", Uint8Array.from([255, 216, 255])),
  ).toBeNull();
  expect(
    localImagePreviewMediaType(
      "image/svg+xml",
      new TextEncoder().encode("<svg onload='alert(1)'></svg>"),
    ),
  ).toBeNull();
});
