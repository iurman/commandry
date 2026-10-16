import { describe, expect, it, vi } from "vitest";
import {
  FOUNDATION_IMPORT_BODY_BYTES,
  FoundationImportBodyError,
  foundationImportBody,
} from "./foundation-import-body";

function streamed(chunks: Uint8Array[], contentLength?: string) {
  const cancel = vi.fn();
  let consumed = 0;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        const chunk = chunks[consumed];
        if (chunk) {
          consumed += 1;
          controller.enqueue(chunk);
        } else controller.close();
      },
      cancel,
    },
    { highWaterMark: 0 },
  );
  const headers = new Headers({ "content-type": "application/json" });
  if (contentLength !== undefined) headers.set("content-length", contentLength);
  const request = new Request("http://localhost/owner-import", {
    method: "POST",
    headers,
    body,
    duplex: "half",
  } as RequestInit);
  return { request, cancel, consumed: () => consumed };
}

describe("selected import request stream", () => {
  it("preserves exact UTF8, CRLF, NUL and split multibyte originals", async () => {
    const original = { original: "caf\u00e9\r\n\u0000\u{1f310}" };
    const bytes = new TextEncoder().encode(JSON.stringify(original));
    const chunks = [...bytes].map((byte) => Uint8Array.of(byte));
    const fixture = streamed(chunks);
    expect(await foundationImportBody(fixture.request)).toEqual(original);
    expect(fixture.consumed()).toBe(bytes.length);
  });

  it("admits the exact physical byte boundary", async () => {
    const bytes = Buffer.from(
      JSON.stringify({
        original: "x".repeat(FOUNDATION_IMPORT_BODY_BYTES - 15),
      }),
    );
    expect(bytes.length).toBe(FOUNDATION_IMPORT_BODY_BYTES);
    expect(await foundationImportBody(streamed([bytes]).request)).toEqual({
      original: "x".repeat(FOUNDATION_IMPORT_BODY_BYTES - 15),
    });
  });

  it.each([undefined, "1"])(
    "counts actual bytes and cancels early with content length %s",
    async (contentLength) => {
      const fixture = streamed(
        [
          new Uint8Array(FOUNDATION_IMPORT_BODY_BYTES),
          Uint8Array.of(32),
          Buffer.from("private remainder must not be consumed"),
        ],
        contentLength,
      );
      await expect(foundationImportBody(fixture.request)).rejects.toMatchObject(
        {
          code: "PAYLOAD_TOO_LARGE",
          status: 413,
        },
      );
      expect(fixture.consumed()).toBe(2);
      expect(fixture.cancel).toHaveBeenCalledTimes(1);
    },
  );

  it("counts multibyte physical bytes independently of JS string length", async () => {
    const text = JSON.stringify({ value: "\u00e9".repeat(4_194_304) });
    expect(text.length).toBeLessThan(FOUNDATION_IMPORT_BODY_BYTES);
    await expect(
      foundationImportBody(streamed([Buffer.from(text)]).request),
    ).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  });

  it("rejects and releases the stream without waiting for provider cancellation", async () => {
    let cancelCalled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(FOUNDATION_IMPORT_BODY_BYTES + 1));
      },
      cancel() {
        cancelCalled = true;
        return new Promise<void>(() => undefined);
      },
    });
    const request = new Request("http://localhost/owner-import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      duplex: "half",
    } as RequestInit);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await expect(
        Promise.race([
          foundationImportBody(request),
          new Promise((_, reject) => {
            timeout = setTimeout(
              () => reject(new Error("Cleanup blocked rejection")),
              500,
            );
          }),
        ]),
      ).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE", status: 413 });
      expect(cancelCalled).toBe(true);
      expect(request.body?.locked).toBe(false);
    } finally {
      clearTimeout(timeout);
    }
  });

  it("rejects malformed UTF8 rather than changing its original bytes", async () => {
    for (const invalid of [
      Buffer.concat([
        Buffer.from('{"s":"'),
        Uint8Array.of(0xc3),
        Buffer.from('"}'),
      ]),
      Buffer.concat([
        Buffer.from('{"s":"'),
        Uint8Array.of(0xed, 0xa0, 0x80),
        Buffer.from('"}'),
      ]),
    ]) {
      await expect(
        foundationImportBody(streamed([invalid]).request),
      ).rejects.toMatchObject({ code: "INVALID_INPUT", status: 400 });
    }
  });

  it("rejects missing bodies, wrong media and invalid JSON with a static error", async () => {
    for (const request of [
      new Request("http://localhost/owner-import", { method: "POST" }),
      new Request("http://localhost/owner-import", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "private source",
      }),
      streamed([Buffer.from("private malformed JSON")]).request,
    ]) {
      await expect(foundationImportBody(request)).rejects.toEqual(
        new FoundationImportBodyError("INVALID_INPUT", 400),
      );
    }
    const request = new Request("http://localhost/owner-import", {
      method: "POST",
      headers: { "content-type": "Application/JSON; charset=utf-8" },
      body: '{"accepted":true}',
    });
    expect(await foundationImportBody(request)).toEqual({ accepted: true });
  });
});

it("uses an explicit smaller foundation operation limit on actual streamed bytes", async () => {
  const bytes = Buffer.from('{"text":"exact"}');
  expect(
    await foundationImportBody(streamed([bytes]).request, bytes.length),
  ).toEqual({ text: "exact" });
  const excess = streamed([bytes, Buffer.from(" ")], "1");
  await expect(
    foundationImportBody(excess.request, bytes.length),
  ).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE", status: 413 });
  expect(excess.consumed()).toBe(2);
});
