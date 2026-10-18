// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { resourceIcon } from "../gravity/resource-icons";
import { ObservatoryResourceMark } from "./ObservatoryResourceMark";

const github = resourceIcon("github")!;
const logo = "/logos/abcdefab-0000-4000-8000-000000000001/" + "d".repeat(64);
afterEach(cleanup);

describe("Observatory resource badge mark", () => {
  it("shows the approved logo in place of the icon glyph", () => {
    const { container } = render(
      <ObservatoryResourceMark
        kind="repository"
        icon={github}
        theme="porcelain"
        logo={logo}
      />,
    );
    const mark = container.querySelector(".cmd-op-kind")!;
    expect(mark).toHaveAttribute("data-kind", "repository");
    expect(mark).toHaveAttribute("data-logo", "true");
    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(mark.querySelector("img")).toHaveAttribute("src", logo);
    expect(mark.querySelector("img")).toHaveAttribute("alt", "");
    expect(mark.querySelector("svg")).toBeNull();
    // A brand colour belongs to the glyph, not to a logo image.
    expect(mark.getAttribute("style")).toBeNull();
  });

  it("keeps the resolved glyph without a logo or after the image fails", () => {
    const { container, rerender } = render(
      <ObservatoryResourceMark
        kind="repository"
        icon={github}
        theme="porcelain"
      />,
    );
    const mark = () => container.querySelector(".cmd-op-kind")!;
    expect(mark().querySelector("img")).toBeNull();
    expect(mark().querySelector("svg path")).toHaveAttribute("d", github.path);
    expect(mark()).toHaveAttribute("data-icon", "github");
    rerender(
      <ObservatoryResourceMark
        kind="repository"
        icon={github}
        theme="porcelain"
        logo={logo}
      />,
    );
    fireEvent.error(mark().querySelector("img")!);
    expect(mark().querySelector("img")).toBeNull();
    expect(mark().querySelector("svg")).not.toBeNull();
    expect(mark()).not.toHaveAttribute("data-logo");
    // A newly approved digest is a new address and is tried again.
    rerender(
      <ObservatoryResourceMark
        kind="repository"
        icon={github}
        theme="porcelain"
        logo={logo.replace(/d+$/, "e".repeat(64))}
      />,
    );
    expect(mark().querySelector("img")).not.toBeNull();
  });

  it("keeps a server glyph on a host that shows a technology", () => {
    const { container, rerender } = render(
      <ObservatoryResourceMark
        kind="host"
        icon={resourceIcon("debian")!}
        theme="midnight"
      />,
    );
    const mark = () => container.querySelector(".cmd-op-kind")!;
    expect(mark()).toHaveAttribute("data-icon", "debian");
    expect(mark()).toHaveAttribute("data-machine", "true");
    expect(
      mark().querySelector(".cmd-op-kind-machine svg path"),
    ).toHaveAttribute("d", resourceIcon("server")!.path);
    // A shared reference to a host draws like the host it refers to.
    rerender(
      <ObservatoryResourceMark
        kind="reference"
        subjectKind="host"
        icon={resourceIcon("debian")!}
        theme="midnight"
      />,
    );
    expect(mark()).toHaveAttribute("data-kind", "reference");
    expect(mark()).toHaveAttribute("data-machine", "true");
    // The plain server glyph, other kinds and logos need no second server.
    for (const props of [
      { kind: "host", icon: resourceIcon("server")! },
      { kind: "service", icon: resourceIcon("postgresql")! },
      { kind: "host", icon: resourceIcon("debian")!, logo },
    ]) {
      rerender(<ObservatoryResourceMark theme="midnight" {...props} />);
      expect(mark()).not.toHaveAttribute("data-machine");
      expect(mark().querySelector(".cmd-op-kind-machine")).toBeNull();
    }
  });
});
