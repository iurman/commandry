// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "./page";

describe("Command Center foundation", () => {
  it("links working destinations while labeling unavailable data", () => {
    render(<HomePage />);

    const navigation = screen.getByRole("navigation", {
      name: "Main navigation",
    });
    const links = within(navigation).getAllByRole("link");
    expect(
      links.map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([
      ["Home", "/"],
      ["Inbox", "/inbox"],
      ["Projects", "/projects"],
      ["Search", "/search"],
    ]);

    expect(
      screen.getByRole("heading", { name: "Command Center" }),
    ).toBeTruthy();
    expect(screen.getAllByText("No data")).toHaveLength(3);
    expect(screen.getByText("Not connected")).toBeTruthy();
    expect(
      screen.getByText(/does not report project or system health/),
    ).toBeTruthy();
  });
});
