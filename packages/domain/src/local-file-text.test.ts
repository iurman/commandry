import { describe, expect, it } from "vitest";
import {
  extractLocalFileText,
  LOCAL_FILE_TEXT_MAX_CHARACTERS,
} from "./local-file-text";

describe("local file text extraction", () => {
  it("reads UTF-8 Markdown and marks a bounded projection", () => {
    const text = "# Evidence\n" + "x".repeat(LOCAL_FILE_TEXT_MAX_CHARACTERS);
    const result = extractLocalFileText({
      originalName: "evidence.md",
      mediaType: "text/markdown",
      bytes: new TextEncoder().encode(text),
    });
    expect(result.status).toBe("extracted");
    expect(result.text?.length).toBe(LOCAL_FILE_TEXT_MAX_CHARACTERS);
    expect(result.truncated).toBe(true);
  });

  it("leaves unsupported and mislabeled binary files unextracted", () => {
    expect(
      extractLocalFileText({
        originalName: "image.png",
        mediaType: "image/png",
        bytes: Uint8Array.from([137, 80, 78, 71]),
      }).status,
    ).toBe("unsupported");
    expect(
      extractLocalFileText({
        originalName: "binary.txt",
        mediaType: "text/plain",
        bytes: Uint8Array.from([0, 255]),
      }).status,
    ).toBe("failed");
  });
});
