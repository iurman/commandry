// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createEmailDocument, emailContentId } from "./email-document";

describe("isolated email documents", () => {
  it("retains original formatting while removing active/navigation markup and unsafe URLs", () => {
    const result = createEmailDocument(
      '<title>Mail window title</title><style>td{color:red}</style><table><tr><td onclick="alert(1)">Original</td></tr></table><script>bad()</script><meta http-equiv="refresh" content="0;url=https://evil.test"><iframe src="https://evil.test"></iframe><form><input></form><svg onload="bad()"></svg><a href="javascript:bad()">Bad</a><a href="https://example.test/page" ping="https://evil.test">Good</a>',
      { remoteImages: false, inlineImages: {} },
    );
    const doc = new DOMParser().parseFromString(result.document, "text/html");
    expect(doc.querySelector("td")?.textContent).toBe("Original");
    expect(doc.body.textContent).not.toContain("Mail window title");
    expect(doc.querySelector("td")?.hasAttribute("onclick")).toBe(false);
    expect(
      doc.querySelectorAll(
        "script,iframe,form,input,svg,meta[http-equiv=refresh]",
      ),
    ).toHaveLength(0);
    expect(doc.querySelector("style")?.textContent).toContain(
      "color-scheme:light",
    );
    expect(doc.querySelectorAll("a")[0]?.hasAttribute("href")).toBe(false);
    expect(doc.querySelectorAll("a")[1]?.getAttribute("rel")).toBe(
      "noopener noreferrer",
    );
    expect(doc.querySelectorAll("a")[1]?.hasAttribute("ping")).toBe(false);
    expect(result.document).toContain("td{color:red}");
  });
  it("blocks image requests before consent and resolves only supplied CID URLs", () => {
    const html =
      '<img src="https://remote.test/pixel" srcset="https://remote.test/2x 2x"><img src="cid:logo%40mail"><img src="data:image/svg+xml,bad">';
    const blocked = createEmailDocument(html, {
      remoteImages: false,
      inlineImages: {},
    });
    let doc = new DOMParser().parseFromString(blocked.document, "text/html");
    expect(doc.querySelectorAll("img[src]")).toHaveLength(0);
    expect(doc.querySelectorAll("[srcset]")).toHaveLength(0);
    expect(blocked.contentIds).toEqual(["logo@mail"]);
    const enabled = createEmailDocument(html, {
      remoteImages: true,
      inlineImages: { "logo@mail": "https://provider.test/fresh?sig=example" },
    });
    doc = new DOMParser().parseFromString(enabled.document, "text/html");
    expect(
      [...doc.querySelectorAll("img[src]")].map((v) => v.getAttribute("src")),
    ).toEqual([
      "https://remote.test/pixel",
      "https://provider.test/fresh?sig=example",
    ]);
    expect(doc.querySelector("img")?.getAttribute("referrerpolicy")).toBe(
      "no-referrer",
    );
    expect(emailContentId("<logo@mail>")).toBe("logo@mail");
  });
  it("accepts authorized raster data for CID images while refusing active data types", () => {
    const result = createEmailDocument(
      '<img src="cid:logo"><img src="cid:active">',
      {
        remoteImages: false,
        inlineImages: {
          logo: "data:image/png;base64,aGVsbG8=",
          active: "data:image/svg+xml;base64,aGVsbG8=",
        },
      },
    );
    const doc = new DOMParser().parseFromString(result.document, "text/html");
    expect(doc.querySelectorAll("img[src]")).toHaveLength(1);
    expect(doc.querySelector("img")?.getAttribute("src")).toBe(
      "data:image/png;base64,aGVsbG8=",
    );
  });
});
