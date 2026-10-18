// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { ObservatoryResourceMark } from "./ObservatoryResourceMark";

const resourceId = "abcdefab-0000-4000-8000-000000000001";
const logo = {
  digest: "d".repeat(64),
  mediaType: "image/png" as const,
  width: 128 as const,
  height: 128 as const,
  version: 1,
};
const url = (id: string, digest: string) => `/logos/${id}/${digest}`;
afterEach(cleanup);

describe("Observatory resource badge mark", () => {
  it("tags the outline badge with its kind and shows the approved logo", () => {
    const { container } = render(
      <ObservatoryResourceMark
        node={{ kind: "repository", resourceId, logo }}
        fallback="R"
        logoUrl={url}
        tagKind
      />,
    );
    const mark = container.querySelector(".cmd-op-kind")!;
    expect(mark).toHaveAttribute("data-kind", "repository");
    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(mark.querySelector("img")).toHaveAttribute(
      "src",
      `/logos/${resourceId}/${logo.digest}`,
    );
  });

  it("uses the canonical resource address for an alias of a repository", () => {
    const { container } = render(
      <ObservatoryResourceMark
        node={{ kind: "reference", resourceId, logo }}
        fallback="&"
        logoUrl={url}
      />,
    );
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      `/logos/${resourceId}/${logo.digest}`,
    );
    expect(container.querySelector(".cmd-op-kind")).not.toHaveAttribute(
      "data-kind",
    );
  });

  it("keeps the kind mark without a logo, an address or a loadable image", () => {
    const { container, rerender } = render(
      <ObservatoryResourceMark
        node={{ kind: "repository", resourceId }}
        fallback="R"
        logoUrl={url}
      />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container).toHaveTextContent("R");
    rerender(
      <ObservatoryResourceMark
        node={{ kind: "repository", resourceId, logo }}
        fallback="R"
      />,
    );
    expect(container.querySelector("img")).toBeNull();
    rerender(
      <ObservatoryResourceMark
        node={{ kind: "repository", resourceId, logo }}
        fallback="R"
        logoUrl={url}
      />,
    );
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(container).toHaveTextContent("R");
    // A newly approved digest is tried again.
    rerender(
      <ObservatoryResourceMark
        node={{
          kind: "repository",
          resourceId,
          logo: { ...logo, digest: "e".repeat(64), version: 2 },
        }}
        fallback="R"
        logoUrl={url}
      />,
    );
    expect(container.querySelector("img")).not.toBeNull();
  });
});
