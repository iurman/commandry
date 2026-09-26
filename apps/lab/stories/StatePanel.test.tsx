import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatePanel } from "@commandry/ui";

describe("StatePanel", () => {
  it("shows a loading state with busy semantics and no stale content", () => {
    render(
      <StatePanel id="loading-heading" state="loading" title="Attention">
        <p>Old attention item</p>
      </StatePanel>,
    );

    const heading = screen.getByRole("heading", { name: "Attention" });
    expect(heading.closest("section")?.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("Loading", { selector: "p" })).toBeTruthy();
    expect(screen.queryByText("Old attention item")).toBeNull();
  });

  it("keeps permission denial visible in text", () => {
    render(
      <StatePanel
        description="You do not have permission to view these items."
        id="denied-heading"
        state="permission-denied"
        title="Attention"
      />,
    );

    expect(screen.getByText("Access denied")).toBeTruthy();
    expect(
      screen.getByText("You do not have permission to view these items."),
    ).toBeTruthy();
  });
});
