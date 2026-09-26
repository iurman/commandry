// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "./page";

describe("Command Center foundation", () => {
  it("exposes only Home as a working destination and labels unavailable data", () => {
    render(<HomePage />);

    const navigation = screen.getByRole("navigation", {
      name: "Main navigation",
    });
    const links = within(navigation).getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]?.textContent).toBe("Home");
    expect(links[0]?.getAttribute("href")).toBe("/");
    expect(
      within(navigation)
        .getByText("Projects")
        .parentElement?.getAttribute("aria-disabled"),
    ).toBe("true");

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
