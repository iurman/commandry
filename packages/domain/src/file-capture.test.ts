import { expect, test } from "vitest";
import {
  LOCAL_FILE_CAPTURE_MAX_BYTES,
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
