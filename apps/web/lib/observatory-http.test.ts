import { describe, expect, it } from "vitest";
import {
  readObservatoryJson,
  ObservatoryBodyTooLarge,
} from "./observatory-http";
describe("bounded Observatory transport", () => {
  it("reads actual streamed JSON and rejects overflow while cancelling before later data", async () => {
    const encoder = new TextEncoder();
    let cancelled = false,
      pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++;
        controller.enqueue(
          encoder.encode(pulls === 1 ? '{"a":"' : "x".repeat(500)),
        );
      },
      cancel() {
        cancelled = true;
      },
    });
    await expect(
      readObservatoryJson(
        new Request("http://localhost", {
          method: "POST",
          body,
          duplex: "half",
        } as RequestInit),
        100,
      ),
    ).rejects.toBeInstanceOf(ObservatoryBodyTooLarge);
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThan(6);
    await expect(
      readObservatoryJson(
        new Request("http://localhost", {
          method: "POST",
          body: JSON.stringify({ a: [1, 2] }),
        }),
      ),
    ).resolves.toEqual({ a: [1, 2] });
  });
  it("rejects announced overflow, malformed UTF-8 and incomplete JSON", async () => {
    await expect(
      readObservatoryJson(
        new Request("http://localhost", {
          method: "POST",
          headers: { "content-length": "1000" },
          body: "{}",
        }),
        10,
      ),
    ).rejects.toBeInstanceOf(ObservatoryBodyTooLarge);
    for (const body of ["{", new Uint8Array([255, 254])])
      await expect(
        readObservatoryJson(
          new Request("http://localhost", { method: "POST", body }),
        ),
      ).rejects.toBeInstanceOf(SyntaxError);
  });
});
