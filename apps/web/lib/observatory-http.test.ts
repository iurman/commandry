import { describe, expect, it } from "vitest";
import { ObservatoryLogoError } from "@commandry/application";
import { FoundationError } from "@commandry/domain";
import {
  readObservatoryJson,
  ObservatoryBodyTooLarge,
  observatoryLogoFailure,
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
  it("maps only logo outcomes to their safe codes and statuses", () => {
    expect(
      observatoryLogoFailure(
        new ObservatoryLogoError("LOGO_UNSUPPORTED_IMAGE"),
      ),
    ).toEqual({ code: "LOGO_UNSUPPORTED_IMAGE", status: 400 });
    expect(
      observatoryLogoFailure(
        new ObservatoryLogoError("LOGO_SOURCE_UNAUTHORIZED"),
      ),
    ).toEqual({ code: "LOGO_SOURCE_UNAUTHORIZED", status: 502 });
    expect(
      observatoryLogoFailure(new ObservatoryLogoError("LOGO_TOO_LARGE")),
    ).toEqual({ code: "LOGO_TOO_LARGE", status: 413 });
    expect(
      observatoryLogoFailure(
        new ObservatoryLogoError("LOGO_PROCESSING_UNAVAILABLE"),
      ),
    ).toEqual({ code: "LOGO_PROCESSING_UNAVAILABLE", status: 503 });
    expect(observatoryLogoFailure(new FoundationError("NOT_FOUND"))).toBeNull();
    const imitation = Object.assign(new Error("x"), {
      name: "ObservatoryLogoError",
      code: "LOGO_TOO_LARGE",
    });
    expect(observatoryLogoFailure(imitation)).toBeNull();
  });
});
