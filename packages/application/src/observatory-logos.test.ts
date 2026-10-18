import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { OBSERVATORY_LOGO_MAX_INPUT_BYTES } from "@commandry/contracts";
import { FoundationError } from "@commandry/domain";
import {
  createObservatoryLogoService,
  ObservatoryLogoError,
  sniffObservatoryLogo,
  validateObservatoryLogoPng,
  type ObservatoryLogoPort,
  type ObservatoryLogoRepositoryReader,
} from "./observatory-logos";

const owner = {
  principalId: "owner",
  sessionId: "session",
  expiresAt: "2026-10-19T00:00:00.000Z",
};
const resourceId = "abcdefab-0000-4000-8000-000000000001";
const commitSha = "c".repeat(40);
const blobSha = "b".repeat(40);
const review = { evidenceRefs: ["owner:inspector-preview"], note: "Approve" };
const encode = (text: string) => new TextEncoder().encode(text);
const svg = (body: string) =>
  encode(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8">${body}</svg>`,
  );
const sha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
/** A canonical PNG header whose trailing byte follows the input, so different
 * inputs produce different digests. */
function png(marker = 0) {
  const bytes = new Uint8Array(34);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set(encode("IHDR"), 12);
  view.setUint32(16, 128);
  view.setUint32(20, 128);
  bytes[33] = marker;
  return bytes;
}
function harness(
  options: {
    repositories?: string[];
    reader?: ObservatoryLogoRepositoryReader | null;
  } = {},
) {
  const port = {
    inspect: vi.fn<ObservatoryLogoPort["inspect"]>(async () => ({
      repositories: options.repositories ?? ["iurman/aviune"],
    })),
    review: vi.fn<ObservatoryLogoPort["review"]>(async (_owner, change) => ({
      id: change.resourceId,
      version: change.expectedVersion + 1,
      auditId: "abcdefab-0000-4000-8000-0000000000aa",
    })),
  };
  const processor = {
    rasterize: vi.fn(async ({ bytes }: { bytes: Uint8Array }) =>
      png(bytes.length % 256),
    ),
  };
  const svgFile = svg('<rect width="8" height="8"/>');
  const reader =
    options.reader === null
      ? undefined
      : (options.reader ?? {
          readFile: vi.fn(async () => ({ bytes: svgFile, commitSha, blobSha })),
        });
  const service = createObservatoryLogoService({
    port,
    processor,
    ...(reader ? { repositoryReader: reader } : {}),
  });
  return { port, processor, reader, service, svgFile };
}
const upload = (bytes: Uint8Array, fileName = "logo.svg") => ({
  kind: "upload" as const,
  fileName,
  dataBase64: Buffer.from(bytes).toString("base64"),
});
const code = (promise: Promise<unknown>) =>
  promise.then(
    () => "resolved",
    (error: unknown) =>
      error instanceof ObservatoryLogoError || error instanceof FoundationError
        ? error.code
        : String(error),
  );

describe("Observatory logo input recognition", () => {
  it("identifies raster formats by their bytes, not their names", () => {
    const pad = (prefix: number[]) =>
      new Uint8Array([...prefix, ...Array(16).fill(0)]);
    expect(
      sniffObservatoryLogo(
        pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe("image/png");
    expect(sniffObservatoryLogo(pad([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      "image/jpeg",
    );
    expect(
      sniffObservatoryLogo(
        new Uint8Array([...encode("RIFF"), 0, 0, 0, 0, ...encode("WEBPVP8 ")]),
      ),
    ).toBe("image/webp");
    expect(sniffObservatoryLogo(svg('<path d="M0 0h8v8z"/>'))).toBe(
      "image/svg+xml",
    );
    expect(
      sniffObservatoryLogo(
        encode(
          '﻿<?xml version="1.0"?>\n<!-- brand --><svg width="8" height="8"></svg>',
        ),
      ),
    ).toBe("image/svg+xml");
  });

  it.each([
    ["a GIF", encode("GIF89a\u0001\u0000\u0001\u0000\u0000\u0000\u0000")],
    [
      "an ICO favicon",
      new Uint8Array([0, 0, 1, 0, 1, 0, 16, 16, 0, 0, 1, 0, 32, 0]),
    ],
    ["HTML", encode("<!doctype html><html><body><svg></svg></body></html>")],
    ["a DOCTYPE", encode('<!DOCTYPE svg [<!ENTITY x "y">]><svg>&x;</svg>')],
    ["a script", svg("<script>alert(1)</script>")],
    ["a namespaced script", svg("<svg:script>alert(1)</svg:script>")],
    ["foreignObject", svg("<foreignObject><div/></foreignObject>")],
    ["an outside image", svg('<image href="https://example.com/a.png"/>')],
    ["a file reference", svg('<image xlink:href="file:///etc/passwd"/>')],
    ["a relative reference", svg('<use href="other.svg#icon"/>')],
    ["an unquoted reference", svg("<use href=other.svg/>")],
    [
      "an embedded SVG",
      svg('<image href="data:image/svg+xml;base64,PHN2Zz4="/>'),
    ],
    [
      "an outside CSS url",
      svg('<rect style="fill:url(https://example.com/x)"/>'),
    ],
    [
      "a CSS import",
      svg("<style>@import 'https://example.com/a.css';</style>"),
    ],
    [
      "a stylesheet instruction",
      encode('<?xml-stylesheet href="a.css"?><svg></svg>'),
    ],
    [
      "invalid UTF-8",
      new Uint8Array([
        0x3c, 0x73, 0x76, 0x67, 0x20, 0xff, 0xfe, 0x3e, 0, 0, 0, 0,
      ]),
    ],
  ])("refuses %s", (_name, bytes) => {
    expect(() => sniffObservatoryLogo(bytes)).toThrow("LOGO_UNSUPPORTED_IMAGE");
  });

  it("allows same-document references and embedded raster data", () => {
    expect(
      sniffObservatoryLogo(
        svg(
          '<defs><path id="p" d="M0 0h1z"/></defs><use href="#p"/><rect fill="url(#g)"/><image href="data:image/png;base64,iVBORw0KGgo="/>',
        ),
      ),
    ).toBe("image/svg+xml");
  });

  it("bounds input before recognising it", () => {
    expect(() =>
      sniffObservatoryLogo(
        new Uint8Array(OBSERVATORY_LOGO_MAX_INPUT_BYTES + 1),
      ),
    ).toThrow("LOGO_TOO_LARGE");
    expect(() => sniffObservatoryLogo(new Uint8Array(4))).toThrow(
      "LOGO_UNSUPPORTED_IMAGE",
    );
  });

  it("accepts only the canonical badge PNG from a processor", () => {
    expect(() => validateObservatoryLogoPng(png())).not.toThrow();
    const wrong = png();
    new DataView(wrong.buffer).setUint32(16, 64);
    expect(() => validateObservatoryLogoPng(wrong)).toThrow(
      "LOGO_UNSUPPORTED_IMAGE",
    );
    expect(() =>
      validateObservatoryLogoPng(encode("not a png at all, long enough")),
    ).toThrow("LOGO_UNSUPPORTED_IMAGE");
  });
});

describe("Observatory logo preview", () => {
  it("previews an upload without writing and records its source", async () => {
    const { port, service } = harness();
    const bytes = svg('<circle r="4"/>');
    const result = await service.preview(owner, {
      resourceId,
      input: upload(bytes, "ResuPals.svg"),
    });
    expect(port.inspect).toHaveBeenCalledWith(owner, resourceId, {
      sourceKind: "upload",
    });
    expect(port.review).not.toHaveBeenCalled();
    expect(result.image).toMatchObject({
      mediaType: "image/png",
      width: 128,
      height: 128,
      digest: sha256(png(bytes.length % 256)),
    });
    expect(result.source).toEqual({
      kind: "upload",
      fileName: "ResuPals.svg",
      originalMediaType: "image/svg+xml",
      originalByteLength: bytes.length,
      originalDigest: sha256(bytes),
    });
  });

  it("reads a reviewed repository file at the resolved commit", async () => {
    const { reader, service, svgFile } = harness({
      repositories: ["iurman/aviune"],
    });
    const result = await service.preview(owner, {
      resourceId,
      input: {
        kind: "repository_file",
        repository: "iurman/Aviune",
        path: "public/favicon.svg",
        ref: null,
      },
    });
    expect(reader!.readFile).toHaveBeenCalledWith({
      repository: "iurman/Aviune",
      path: "public/favicon.svg",
      ref: null,
      commitSha: null,
    });
    expect(result.source).toMatchObject({
      kind: "repository_file",
      commitSha,
      blobSha,
      originalDigest: sha256(svgFile),
    });
  });

  it("never reads a repository that was not reviewed for the resource", async () => {
    const { reader, service } = harness({ repositories: ["iurman/aviune"] });
    expect(
      await code(
        service.preview(owner, {
          resourceId,
          input: {
            kind: "repository_file",
            repository: "someone/else",
            path: "logo.svg",
            ref: "main",
          },
        }),
      ),
    ).toBe("LOGO_REPOSITORY_NOT_REVIEWED");
    expect(reader!.readFile).not.toHaveBeenCalled();
  });

  it("reports a missing repository reader instead of falling back", async () => {
    const { service } = harness({ reader: null });
    expect(
      await code(
        service.preview(owner, {
          resourceId,
          input: {
            kind: "repository_file",
            repository: "iurman/aviune",
            path: "logo.svg",
            ref: null,
          },
        }),
      ),
    ).toBe("LOGO_SOURCE_UNAVAILABLE");
  });

  it("turns a renderer failure or a malformed result into an unsupported image", async () => {
    const { processor, service } = harness();
    processor.rasterize.mockRejectedValueOnce(new Error("vips: bad header"));
    expect(
      await code(
        service.preview(owner, { resourceId, input: upload(svg("")) }),
      ),
    ).toBe("LOGO_UNSUPPORTED_IMAGE");
    processor.rasterize.mockResolvedValueOnce(encode("x".repeat(40)));
    expect(
      await code(
        service.preview(owner, { resourceId, input: upload(svg("")) }),
      ),
    ).toBe("LOGO_UNSUPPORTED_IMAGE");
  });
});

describe("Observatory logo review", () => {
  it("stores only the exact image the owner previewed", async () => {
    const { port, service } = harness();
    const bytes = svg("<rect/>");
    const preview = await service.preview(owner, {
      resourceId,
      input: upload(bytes),
    });
    await expect(
      service.review(owner, {
        expectedVersion: 0,
        resourceId,
        active: true,
        expectedDigest: preview.image.digest,
        input: upload(bytes),
        review,
      }),
    ).resolves.toMatchObject({ id: resourceId, version: 1 });
    const stored = port.review.mock.calls[0]![1];
    expect(stored.image?.digest).toBe(preview.image.digest);
    expect(Buffer.from(stored.image!.png).toString("base64")).toBe(
      preview.image.dataBase64,
    );
    expect(stored.source).toEqual(preview.source);
    expect(stored.contentDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(port.inspect).toHaveBeenLastCalledWith(owner, resourceId, null);
  });

  it("refuses a different result than the preview", async () => {
    const { port, service } = harness();
    expect(
      await code(
        service.review(owner, {
          expectedVersion: 0,
          resourceId,
          active: true,
          expectedDigest: "0".repeat(64),
          input: upload(svg("<rect/>")),
          review,
        }),
      ),
    ).toBe("VERSION_CONFLICT");
    expect(port.review).not.toHaveBeenCalled();
  });

  it("pins a repository review to the previewed commit", async () => {
    const reader = {
      readFile: vi.fn(async () => ({
        bytes: svg("<rect/>"),
        commitSha: "d".repeat(40),
        blobSha,
      })),
    };
    const { port, service } = harness({ reader });
    expect(
      await code(
        service.review(owner, {
          expectedVersion: 0,
          resourceId,
          active: true,
          expectedDigest: "0".repeat(64),
          input: {
            kind: "repository_file",
            repository: "iurman/aviune",
            path: "logo.svg",
            commitSha,
          },
          review,
        }),
      ),
    ).toBe("LOGO_SOURCE_UNAVAILABLE");
    expect(reader.readFile).toHaveBeenCalledWith({
      repository: "iurman/aviune",
      path: "logo.svg",
      ref: null,
      commitSha,
    });
    expect(port.review).not.toHaveBeenCalled();
  });

  it("retires without reading, processing or storing a new image", async () => {
    const { port, processor, reader, service } = harness();
    await service.review(owner, {
      expectedVersion: 2,
      resourceId,
      active: false,
      expectedDigest: null,
      input: null,
      review: { evidenceRefs: ["owner:retire"], note: "Old brand" },
    });
    expect(port.inspect).not.toHaveBeenCalled();
    expect(processor.rasterize).not.toHaveBeenCalled();
    expect(reader!.readFile).not.toHaveBeenCalled();
    expect(port.review.mock.calls[0]![1]).toMatchObject({
      active: false,
      image: null,
      source: null,
      expectedVersion: 2,
    });
  });

  it("validates input before touching the owner session or any source", async () => {
    const { port, service } = harness();
    await expect(
      service.review(owner, { resourceId, active: true }),
    ).rejects.toThrow();
    await expect(
      service.preview(owner, {
        resourceId,
        input: { kind: "url", url: "https://example.com/logo.svg" },
      }),
    ).rejects.toThrow();
    expect(port.inspect).not.toHaveBeenCalled();
  });
});
