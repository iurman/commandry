// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ObservatoryOperationalEvidence } from "./ObservatoryOperationalEvidence";

const resourceId = "00000000-0000-4000-8000-000000000001";
const projectId = "00000000-0000-4000-8000-000000000002";
const result = (count = 0) => ({
  schemaVersion: 1,
  scopeDigest: "scope",
  projectionRevision: "revision",
  completeness: "complete",
  resourceId,
  facet: "availability",
  access: count ? "unavailable" : "unsupported",
  items: Array.from({ length: count }, (_, index) => ({
    sourceId: `00000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`,
    projectId,
    resourceId,
    kind: "infraagent-monitor",
    version: 1,
    environment: "production",
    enabled: true,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastError: null,
    observedAt: null,
    freshness: "unknown",
    payload: null,
  })),
});
afterEach(cleanup);
describe("operational evidence inspector", () => {
  it("reloads the same subject when a new scene read commits", async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce(result())
      .mockResolvedValue(result(1));
    const view = render(
      <ObservatoryOperationalEvidence
        resourceId={resourceId}
        scopeKey="A"
        readRevision="first-read"
        repository={false}
        loadEvidence={load}
      />,
    );
    expect(
      await screen.findByText("unsupported / 0 reviewed sources"),
    ).toBeVisible();
    view.rerender(
      <ObservatoryOperationalEvidence
        resourceId={resourceId}
        scopeKey="A"
        readRevision="committed-review"
        repository={false}
        loadEvidence={load}
      />,
    );
    expect(
      await screen.findByText("unavailable / 1 reviewed sources"),
    ).toBeVisible();
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("withholds a late response from an earlier read of the same scope", async () => {
    let finish!: (value: unknown) => void;
    const load = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue(result(1));
    const view = render(
      <ObservatoryOperationalEvidence
        resourceId={resourceId}
        scopeKey="A"
        readRevision="first-read"
        repository={false}
        loadEvidence={load}
      />,
    );
    view.rerender(
      <ObservatoryOperationalEvidence
        resourceId={resourceId}
        scopeKey="A"
        readRevision="next-read"
        repository={false}
        loadEvidence={load}
      />,
    );
    expect(
      await screen.findByText("unavailable / 1 reviewed sources"),
    ).toBeVisible();
    await act(async () => finish(result(137)));
    expect(screen.queryByText(/137 reviewed/)).not.toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("reuses an identical read revision without clearing current evidence", async () => {
    const load = vi.fn().mockResolvedValue(result(1));
    const props = {
      resourceId,
      scopeKey: "A",
      readRevision: "same-read",
      repository: false,
      loadEvidence: load,
    };
    const view = render(<ObservatoryOperationalEvidence {...props} />);
    expect(
      await screen.findByText("unavailable / 1 reviewed sources"),
    ).toBeVisible();
    view.rerender(<ObservatoryOperationalEvidence {...props} />);
    expect(screen.getByText("unavailable / 1 reviewed sources")).toBeVisible();
    expect(
      screen.queryByText("Reading authorized evidence..."),
    ).not.toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
  });
  it("keeps every configured source inspectable and does not present unread coverage as passing", async () => {
    render(
      <ObservatoryOperationalEvidence
        resourceId={resourceId}
        scopeKey="A"
        repository={false}
        loadEvidence={async () => result(137)}
      />,
    );
    expect(
      await screen.findByText("unavailable / 137 reviewed sources"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("No supported observation has been recorded."),
    ).toHaveLength(137);
    expect(screen.queryByText(/passing/)).not.toBeInTheDocument();
  });
  it("withholds cross-facet and unexpected raw payloads and offers a retry", async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce({ ...result(), rawPayload: { secret: "PRIVATE" } })
      .mockResolvedValue(result());
    render(
      <ObservatoryOperationalEvidence
        resourceId={resourceId}
        scopeKey="A"
        repository={false}
        loadEvidence={load}
      />,
    );
    expect(await screen.findByText(/Evidence unavailable/)).toBeInTheDocument();
    expect(screen.queryByText("PRIVATE")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry evidence" }));
    expect(
      await screen.findByText(/No supported source is configured/),
    ).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("withholds a late response from the previous project scope", async () => {
    let finish!: (value: unknown) => void;
    const load = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue(result());
    const view = render(
      <ObservatoryOperationalEvidence
        resourceId={resourceId}
        scopeKey="A"
        repository={false}
        loadEvidence={load}
      />,
    );
    view.rerender(
      <ObservatoryOperationalEvidence
        resourceId={resourceId}
        scopeKey="B"
        repository={false}
        loadEvidence={load}
      />,
    );
    expect(
      await screen.findByText("unsupported / 0 reviewed sources"),
    ).toBeInTheDocument();
    finish(result(137));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/137 reviewed/)).not.toBeInTheDocument();
  });
});
