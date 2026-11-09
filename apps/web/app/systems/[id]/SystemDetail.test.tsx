// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { SystemSummary } from "@commandry/contracts";
import { apiJson } from "../../projects/api";
import SystemDetail from "./SystemDetail";
vi.mock("../../projects/api", () => ({ apiJson: vi.fn() }));
vi.mock("@commandry/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@commandry/ui")>()),
  AppShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("./SystemDomainPanel", () => ({
  default: ({
    onChange,
    archived,
  }: {
    onChange: () => void;
    archived: boolean;
  }) => (
    <button disabled={archived} onClick={onChange}>
      Refresh domain relation
    </button>
  ),
}));
vi.mock("./SystemProjectPanel", () => ({ default: () => null }));
vi.mock("./SystemResourcePanel", () => ({ default: () => null }));
vi.mock("./SystemAuditPanel", () => ({ default: () => null }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const initial = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Existing system",
  summary: null,
  lifecycle: "active",
  version: 1,
} as SystemSummary;
it("ignores an older relation read arriving after the archive acknowledgement", async () => {
  let release!: (value: SystemSummary) => void;
  const pending = new Promise<SystemSummary>((resolve) => {
    release = resolve;
  });
  let reads = 0;
  vi.mocked(apiJson).mockImplementation(async (_path, options) => {
    if (options?.method === "PUT")
      return { ...initial, lifecycle: "archived", version: 2 };
    return ++reads === 1 ? initial : pending;
  });
  render(<SystemDetail systemId={initial.id} />);
  await screen.findByRole("heading", { name: initial.name });
  fireEvent.click(
    screen.getByRole("button", { name: "Refresh domain relation" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Archive empty system" }));
  await screen.findByText(/Archived systems are read-only/);
  await act(async () => {
    release(initial);
    await pending;
  });
  expect(screen.getByText(/Archived systems are read-only/)).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Refresh domain relation" }),
  ).toBeDisabled();
});
it("still accepts a newer acknowledged relation read", async () => {
  let reads = 0;
  vi.mocked(apiJson).mockImplementation(async () =>
    ++reads === 1
      ? initial
      : { ...initial, name: "Updated system", version: 2 },
  );
  render(<SystemDetail systemId={initial.id} />);
  await screen.findByRole("heading", { name: initial.name });
  fireEvent.click(
    screen.getByRole("button", { name: "Refresh domain relation" }),
  );
  await screen.findByRole("heading", { name: "Updated system" });
});
