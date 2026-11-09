// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EmailBody } from "./EmailBody";
const id = "00000000-0000-4000-8000-000000000001";
const attachmentId = "00000000-0000-4000-8000-000000000002";
const attachment = {
  id: attachmentId,
  filename: "logo.png",
  contentType: "image/png",
  size: 6,
  contentId: "logo",
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("loads a direct-mail CID raster only after consent through the authenticated owner route", async () => {
  const url =
    window.location.origin + `/api/v1/email/attachment/${id}/${attachmentId}`;
  const requests: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (raw: unknown, init?: RequestInit) => {
      requests.push({ url: String(raw), ...(init ? { init } : {}) });
      return String(raw).endsWith("/attachments")
        ? Response.json({
            items: [{ ...attachment, ownerDownload: true, downloadUrl: url }],
            nextCursor: null,
          })
        : new Response(new Uint8Array([1, 2, 3, 4, 5, 6]), {
            headers: { "content-type": "image/png" },
          });
    }),
  );
  render(
    <EmailBody
      id={id}
      html={'<p>Original</p><img src="cid:logo">'}
      text="Original"
      complete
      attachments={{ items: [attachment], nextCursor: null }}
    />,
  );
  expect(requests).toHaveLength(0);
  expect(
    screen.getByTitle("Isolated original email HTML").getAttribute("srcdoc"),
  ).not.toContain("data:image/png;base64,");
  fireEvent.click(screen.getByRole("button", { name: "Load images" }));
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toContain(
      "1 embedded images resolved.",
    ),
  );
  expect(requests).toHaveLength(2);
  expect(requests[1]!.url).toBe(url);
  expect(requests[1]!.init?.credentials).toBe("same-origin");
  expect(
    screen.getByTitle("Isolated original email HTML").getAttribute("srcdoc"),
  ).toContain("data:image/png;base64,AQIDBAUG");
  expect(
    screen.getByTitle("Isolated original email HTML").getAttribute("sandbox"),
  ).not.toContain("allow-same-origin");
});
it("refuses owner credentials to external paths and allows a fresh metadata retry", async () => {
  const requests: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (raw: unknown) => {
      requests.push(String(raw));
      return Response.json({
        items: [
          {
            ...attachment,
            ownerDownload: true,
            downloadUrl: "https://untrusted.example.test/attachment",
          },
        ],
        nextCursor: null,
      });
    }),
  );
  render(
    <EmailBody
      id={id}
      html={'<img src="cid:logo">'}
      text={null}
      complete
      attachments={{ items: [attachment], nextCursor: null }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Load images" }));
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toContain("1 unavailable"),
  );
  expect(requests).toEqual(["/api/v1/email/attachments"]);
  fireEvent.click(
    screen.getByRole("button", { name: "Load remaining images" }),
  );
  await waitFor(() => expect(requests).toHaveLength(2));
});
