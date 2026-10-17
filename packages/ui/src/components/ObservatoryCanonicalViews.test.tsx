// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  observatoryViewConfigurationSchema,
  type ObservatoryView,
} from "@commandry/contracts";
import {
  ObservatoryCanonicalViews,
  type ObservatoryViewsClient,
} from "./ObservatoryCanonicalViews";
const configuration = observatoryViewConfigurationSchema.parse({
  schemaVersion: 2,
});
const view = (n: number): ObservatoryView => ({
  schemaVersion: 1,
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  name: "Account " + n,
  projectId: null,
  configuration,
  version: 1,
  updatedAt: "2026-10-16T12:00:00Z",
});
const client = (): ObservatoryViewsClient => ({
  page: vi.fn(async () => ({
    schemaVersion: 1 as const,
    items: [],
    total: 0,
    nextCursor: null,
  })),
  create: vi.fn(async (input) => ({ ...view(1), ...input, version: 1 })),
  update: vi.fn(async (input) => ({
    ...view(1),
    ...input,
    version: input.expectedVersion + 1,
  })),
  delete: vi.fn(async (input) => ({
    schemaVersion: 1 as const,
    id: input.id,
    version: input.expectedVersion + 1,
    deleted: true as const,
    updatedAt: view(1).updatedAt,
  })),
});
afterEach(cleanup);
describe("private account view controls", () => {
  it("follows all pages and applies the exact configuration without a resource cap", async () => {
    const api = client(),
      items = Array.from({ length: 137 }, (_, i) => view(i + 1)),
      apply = vi.fn();
    api.page = vi.fn(async (query) => {
      const start = query.cursor
        ? items.findIndex((v) => v.id === query.cursor) + 1
        : 0;
      const page = items.slice(start, start + 100);
      return {
        schemaVersion: 1 as const,
        items: page,
        total: 137,
        nextCursor: start + page.length < 137 ? page.at(-1)!.id : null,
      };
    });
    render(
      <ObservatoryCanonicalViews
        client={api}
        projectId={null}
        configuration={configuration}
        onApply={apply}
      />,
    );
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: /^Apply Account/ }),
      ).toHaveLength(137),
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply Account 137" }));
    expect(apply).toHaveBeenCalledWith(configuration);
    expect(api.page).toHaveBeenCalledTimes(2);
  });
  it("retries an unconfirmed save with its same UUID and payload despite presentation changes", async () => {
    const api = client();
    let attempt = 0;
    api.create = vi.fn(async (input) => {
      if (++attempt === 1) throw new Error("lost response");
      return { ...view(1), ...input, version: 1 };
    });
    const { rerender } = render(
      <ObservatoryCanonicalViews
        client={api}
        projectId={null}
        configuration={configuration}
        onApply={() => {}}
      />,
    );
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    fireEvent.change(screen.getByLabelText("Account view name"), {
      target: { value: "My view" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save account view" }));
    await screen.findByRole("alert");
    rerender(
      <ObservatoryCanonicalViews
        client={api}
        projectId={null}
        configuration={{ ...configuration, theme: "midnight" }}
        onApply={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save account view" }));
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.create).mock.calls[1]?.[0]).toEqual(
      vi.mocked(api.create).mock.calls[0]?.[0],
    );
  });
  it("does not publish a partial or foreign-scope collection and discloses missing owner access", async () => {
    const api = client();
    api.page = vi.fn(async () => ({
      schemaVersion: 1 as const,
      items: [view(1)],
      total: 137,
      nextCursor: null,
    }));
    render(
      <ObservatoryCanonicalViews
        client={api}
        projectId={null}
        configuration={configuration}
        onApply={() => {}}
      />,
    );
    await screen.findByRole("alert");
    expect(
      screen.queryByRole("button", { name: "Apply Account 1" }),
    ).toBeNull();
    cleanup();
    render(
      <ObservatoryCanonicalViews
        projectId={null}
        configuration={configuration}
        onApply={() => {}}
      />,
    );
    expect(screen.getByText(/Owner sign-in is required/)).toBeVisible();
  });
});
