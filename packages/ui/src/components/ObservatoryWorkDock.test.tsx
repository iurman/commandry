// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  FoundationProjectWorkCursor,
  FoundationProjectWorkPage,
  FoundationProjectWorkRecord,
} from "@commandry/contracts";
import {
  ObservatoryWorkDock,
  type ObservatoryWorkDockProps,
} from "./ObservatoryWorkDock";

const id = (n: number) =>
  "00000000-0000-4000-8000-" + n.toString(16).padStart(12, "0");
const a = id(1),
  b = id(2),
  outside = id(3);
const createdAt = "2026-10-01T12:00:00.123Z",
  updatedAt = "2026-10-15T14:00:00.456Z";
const work = (n = 100, projectId = a): FoundationProjectWorkRecord => ({
  id: id(n),
  projectId,
  sourceCaptureId: id(40),
  generatedFromWorkItemId: null,
  title: "Work " + n,
  description: "Literal canonical description " + n,
  workType: "task",
  status: "open",
  assigneeKind: "unassigned",
  assigneeAgentId: null,
  assigneeLabel: null,
  priority: null,
  dueOn: null,
  contextLink: null,
  createdAt,
  updatedAt,
});
const page = (
  projectId: string,
  items: FoundationProjectWorkRecord[],
  nextCursor: FoundationProjectWorkCursor | null = null,
): FoundationProjectWorkPage => ({
  schemaVersion: 1,
  requestedProjectId: projectId,
  consistency: "live",
  selectedAt: "2026-10-16T12:00:00Z",
  items: items.map((work) => ({ work, contentDigest: "a".repeat(64) })),
  nextCursor,
});
const props = (
  loadPage: ObservatoryWorkDockProps["loadPage"],
  extra: Partial<ObservatoryWorkDockProps> = {},
): ObservatoryWorkDockProps => ({
  projectIds: [a],
  selectedProjectId: null,
  loadPage,
  ...extra,
});
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
afterEach(cleanup);

describe("complete canonical Observatory Work dock", () => {
  it("loads all 193 canonical items through continuation and exposes every item to search and filters", async () => {
    const items = Array.from({ length: 193 }, (_, n) => ({
      ...work(n + 100),
      workType: ["task", "initiative", "subtask"][
        n % 3
      ] as FoundationProjectWorkRecord["workType"],
      status: n % 2 ? ("done" as const) : ("open" as const),
    }));
    const load = vi.fn(
      async (_projectId: string, cursor: FoundationProjectWorkCursor | null) =>
        cursor === null
          ? page(a, items.slice(0, 100), {
              projectId: a,
              afterId: items[99]!.id,
            })
          : page(a, items.slice(100)),
    );
    render(<ObservatoryWorkDock {...props(load)} />);
    expect(await screen.findByText("193 Work items")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenLastCalledWith(a, {
      projectId: a,
      afterId: items[99]!.id,
    });
    expect(
      screen.getByRole("list", { name: "Canonical Work items" }).children,
    ).toHaveLength(193);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search Work" }), {
      target: { value: "Work 292" },
    });
    expect(
      screen.getByText("Showing 1 of 193 Work items."),
    ).toBeInTheDocument();
    expect(screen.getByText("Work 292")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Work type" }), {
      target: { value: "subtask" },
    });
    expect(
      screen.getByText("Showing 64 of 193 Work items."),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Work status" }), {
      target: { value: "done" },
    });
    expect(
      screen.getByText("Showing 32 of 193 Work items."),
    ).toBeInTheDocument();
    expect(screen.getByText("193 Work items")).toBeInTheDocument();
  });
  it("withholds first-page rows and totals until every continuation is complete", async () => {
    const second = deferred<FoundationProjectWorkPage>();
    const load = vi.fn(
      async (_projectId: string, cursor: FoundationProjectWorkCursor | null) =>
        cursor === null
          ? page(a, [work()], { projectId: a, afterId: work().id })
          : second.promise,
    );
    render(<ObservatoryWorkDock {...props(load)} />);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(
      screen.getByText("Loading all Work pages. Totals unavailable."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Work 100")).not.toBeInTheDocument();
    expect(screen.queryByText("1 Work item")).not.toBeInTheDocument();
    await act(async () => second.resolve(page(a, [work(101)])));
    expect(await screen.findByText("2 Work items")).toBeInTheDocument();
  });
  it("deduplicates one shared canonical identity while retaining primary and active project context details", async () => {
    const shared = work(),
      contextLink = {
        id: id(60),
        projectId: b,
        createdAt: "2026-10-14T10:00:00Z",
      };
    const load = vi.fn(async (projectId: string) => {
      const result = page(projectId, [
        { ...shared, contextLink: projectId === a ? null : contextLink },
      ]);
      result.items[0]!.contentDigest = (projectId === a ? "a" : "b").repeat(64);
      return result;
    });
    render(<ObservatoryWorkDock {...props(load, { projectIds: [a, b, a] })} />);
    expect(await screen.findByText("1 Work item")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
    expect(screen.getAllByText("Work 100")).toHaveLength(1);
    expect(screen.getByText("Primary project: " + a)).toBeInTheDocument();
    expect(
      screen.getByText("Active project context: " + b),
    ).toBeInTheDocument();
    expect(screen.getByText(/Context link/)).toHaveTextContent(contextLink.id);
    expect(screen.getByText(contextLink.createdAt)).toHaveAttribute(
      "datetime",
      contextLink.createdAt,
    );
  });
  it("preserves actual types, statuses, assignments, literal text and dates without inferring execution", async () => {
    const task = {
      ...work(),
      title: "<img src=x onerror=PRIVATE>",
      description: "Literal <script>PRIVATE</script>\nsecond line",
      priority: "high" as const,
      dueOn: "2026-11-02",
      assigneeKind: "agent" as const,
      assigneeAgentId: id(50),
      assigneeLabel: "Assigned agent",
      generatedFromWorkItemId: id(70),
    };
    const initiative = {
      ...work(101),
      workType: "initiative" as const,
      status: "done" as const,
      assigneeKind: "local_user" as const,
      assigneeLabel: "Local owner",
    };
    const subtask = { ...work(102), workType: "subtask" as const };
    render(
      <ObservatoryWorkDock
        {...props(async () => page(a, [task, initiative, subtask]))}
      />,
    );
    expect(await screen.findByText("3 Work items")).toBeInTheDocument();
    const detail = screen.getByText(task.title).closest("details")!;
    expect(within(detail).getByText("Task")).toBeInTheDocument();
    expect(within(detail).getByText("Open")).toBeInTheDocument();
    expect(within(detail).getByText("Agent")).toBeInTheDocument();
    expect(within(detail).getByText(task.assigneeLabel)).toBeInTheDocument();
    expect(within(detail).getByText(task.assigneeAgentId)).toBeInTheDocument();
    expect(
      within(detail).getByText(task.description, {
        exact: false,
        normalizer: (value) => value,
      }),
    ).toBeInTheDocument();
    for (const date of [createdAt, updatedAt, task.dueOn])
      expect(within(detail).getByText(date)).toHaveAttribute("datetime", date);
    expect(
      within(detail).getByText(task.generatedFromWorkItemId),
    ).toBeInTheDocument();
    expect(
      within(screen.getByText("Work 101").closest("details")!).getByText(
        "Done",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByText("Work 102").closest("details")!).getByText(
        "Subtask",
      ),
    ).toBeInTheDocument();
    expect(document.querySelector("img, script")).toBeNull();
    expect(screen.getByRole("note")).toHaveTextContent(
      "Actual runtime unavailable. Assignment is not an active run.",
    );
    expect(screen.queryByText(/^(running|queued)$/i)).not.toBeInTheDocument();
    expect(screen.getByText(/no as-of snapshot guarantee/)).toBeInTheDocument();
    expect(screen.queryByText("2026-10-16T12:00:00Z")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Assignment" }), {
      target: { value: "agent" },
    });
    expect(screen.getByText("Showing 1 of 3 Work items.")).toBeInTheDocument();
  });
  it.each([
    "malformed status",
    "foreign page",
    "foreign row",
    "foreign cursor",
    "repeated cursor",
    "duplicate identity",
    "extra field",
    "accessor",
  ])(
    "fails closed for %s without partial totals or provider error text",
    async (mode) => {
      let invoked = false;
      const load = vi.fn(async () => {
        const result = page(a, [work()]);
        if (mode === "malformed status")
          Object.assign(result.items[0]!.work, { status: "running" });
        if (mode === "foreign page") result.requestedProjectId = b;
        if (mode === "foreign row") result.items[0]!.work.projectId = outside;
        if (mode === "foreign cursor")
          result.nextCursor = { projectId: b, afterId: work().id };
        if (mode === "repeated cursor")
          result.nextCursor = { projectId: a, afterId: work().id };
        if (mode === "duplicate identity") result.items.push(result.items[0]!);
        if (mode === "extra field")
          Object.assign(result, {
            privateProviderBody: "PRIVATE_PROVIDER_BODY",
          });
        if (mode === "accessor")
          Object.defineProperty(result, "items", {
            enumerable: true,
            get() {
              invoked = true;
              throw new Error("PRIVATE_PROVIDER_BODY");
            },
          });
        return result;
      });
      render(<ObservatoryWorkDock {...props(load)} />);
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Work unavailable",
      );
      expect(screen.queryByText("Work 100")).not.toBeInTheDocument();
      expect(screen.queryByText("1 Work item")).not.toBeInTheDocument();
      expect(
        screen.queryByText(/PRIVATE_PROVIDER_BODY/),
      ).not.toBeInTheDocument();
      expect(invoked).toBe(false);
      expect(load).toHaveBeenCalledTimes(mode === "repeated cursor" ? 2 : 1);
    },
  );
  it("rejects conflicting canonical content across shared project contexts even when digests match", async () => {
    const load = vi.fn(async (projectId: string) =>
      page(projectId, [
        {
          ...work(),
          title: projectId === a ? "Canonical title" : "Conflicting title",
          contextLink:
            projectId === a ? null : { id: id(60), projectId: b, createdAt },
        },
      ]),
    );
    render(<ObservatoryWorkDock {...props(load, { projectIds: [a, b] })} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Totals unavailable",
    );
    expect(screen.queryByText("Canonical title")).not.toBeInTheDocument();
    expect(screen.queryByText("Conflicting title")).not.toBeInTheDocument();
  });
  it("withholds all projects when a required continuation is denied, then retries from the beginning", async () => {
    let denied = true;
    const load = vi.fn(
      async (projectId: string, cursor: FoundationProjectWorkCursor | null) => {
        if (projectId === b) return page(b, [work(200, b)]);
        if (cursor === null)
          return page(a, [work()], { projectId: a, afterId: work().id });
        if (denied) throw new Error("PRIVATE denied upstream body");
        return page(a, [work(101)]);
      },
    );
    render(<ObservatoryWorkDock {...props(load, { projectIds: [a, b] })} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Totals unavailable",
    );
    expect(screen.queryByText("Work 200")).not.toBeInTheDocument();
    expect(screen.queryByText(/PRIVATE/)).not.toBeInTheDocument();
    denied = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry Work" }));
    expect(await screen.findByText("3 Work items")).toBeInTheDocument();
    expect(
      load.mock.calls.filter(
        ([projectId, cursor]) => projectId === a && cursor === null,
      ),
    ).toHaveLength(2);
  });
  it("narrows selection within authorized projects and rejects selection that cannot add authority", async () => {
    const load = vi.fn(async () => page(a, [work()]));
    const view = render(
      <ObservatoryWorkDock
        {...props(load, { projectIds: [a, b], selectedProjectId: a })}
      />,
    );
    expect(await screen.findByText("1 Work item")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith(a, null);
    view.rerender(
      <ObservatoryWorkDock
        {...props(load, { projectIds: [a], selectedProjectId: b })}
      />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Totals unavailable",
    );
    expect(screen.queryByText("Work 100")).not.toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
  });
  it("ignores late old-scope results after selected project and authorized scope change", async () => {
    const old = deferred<FoundationProjectWorkPage>();
    const load = vi.fn(async (projectId: string) =>
      projectId === a ? old.promise : page(b, [work(200, b)]),
    );
    const view = render(
      <ObservatoryWorkDock
        {...props(load, { projectIds: [a, b], selectedProjectId: a })}
      />,
    );
    await waitFor(() => expect(load).toHaveBeenCalledWith(a, null));
    view.rerender(
      <ObservatoryWorkDock
        {...props(load, { projectIds: [b], selectedProjectId: b })}
      />,
    );
    expect(await screen.findByText("Work 200")).toBeInTheDocument();
    await act(async () =>
      old.resolve(page(a, [work()], { projectId: a, afterId: work().id })),
    );
    expect(screen.queryByText("Work 100")).not.toBeInTheDocument();
    expect(screen.getByText("Work 200")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("cancels pending work on pause, hides prior totals and reloads on resume", async () => {
    const old = deferred<FoundationProjectWorkPage>();
    const load = vi
      .fn<ObservatoryWorkDockProps["loadPage"]>()
      .mockImplementationOnce(() => old.promise)
      .mockResolvedValue(page(a, [work(101)]));
    const view = render(<ObservatoryWorkDock {...props(load)} />);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    view.rerender(<ObservatoryWorkDock {...props(load, { paused: true })} />);
    await act(async () =>
      old.resolve(page(a, [work()], { projectId: a, afterId: work().id })),
    );
    expect(
      screen.getByText("Work loading paused. Totals unavailable."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Work 100")).not.toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
    view.rerender(<ObservatoryWorkDock {...props(load)} />);
    expect(await screen.findByText("Work 101")).toBeInTheDocument();
    view.rerender(<ObservatoryWorkDock {...props(load, { paused: true })} />);
    expect(screen.queryByText("1 Work item")).not.toBeInTheDocument();
    expect(screen.queryByText("Work 101")).not.toBeInTheDocument();
    const resumed = deferred<FoundationProjectWorkPage>();
    load.mockImplementationOnce(() => resumed.promise);
    view.rerender(<ObservatoryWorkDock {...props(load)} />);
    expect(
      screen.getByText("Loading all Work pages. Totals unavailable."),
    ).toBeInTheDocument();
    expect(screen.queryByText("1 Work item")).not.toBeInTheDocument();
    expect(screen.queryByText("Work 101")).not.toBeInTheDocument();
    await act(async () => resumed.resolve(page(a, [work(102)])));
    expect(await screen.findByText("Work 102")).toBeInTheDocument();
  });
  it("does not continue pagination after unmount", async () => {
    const old = deferred<FoundationProjectWorkPage>(),
      load = vi.fn(async () => old.promise);
    const view = render(<ObservatoryWorkDock {...props(load)} />);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    view.unmount();
    await act(async () =>
      old.resolve(page(a, [work()], { projectId: a, afterId: work().id })),
    );
    expect(load).toHaveBeenCalledTimes(1);
  });
  it("does not infer an empty population from missing authority, but accepts a complete empty page", async () => {
    const load = vi.fn(async () => page(a, []));
    const view = render(
      <ObservatoryWorkDock {...props(load, { projectIds: [] })} />,
    );
    expect(
      await screen.findByText(
        "No authorized project context. Work totals unavailable.",
      ),
    ).toBeInTheDocument();
    expect(load).not.toHaveBeenCalled();
    view.rerender(<ObservatoryWorkDock {...props(load)} />);
    expect(await screen.findByText("0 Work items")).toBeInTheDocument();
    expect(
      screen.getByText("No canonical Work items in this project context."),
    ).toBeInTheDocument();
  });
  it("only links a supplied safe local canonical Work route and never invents per-item paths", async () => {
    const load = vi.fn(async () => page(a, [work()]));
    const view = render(<ObservatoryWorkDock {...props(load)} />);
    await screen.findByText("1 Work item");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    view.rerender(
      <ObservatoryWorkDock
        {...props(load, { workPageHref: "/known-work-page" })}
      />,
    );
    expect(
      screen.getByRole("link", { name: "Open canonical Work" }),
    ).toHaveAttribute("href", "/known-work-page");
    for (const workPageHref of [
      "javascript:alert(1)",
      "//foreign.invalid/work",
      "/\\foreign.invalid",
      "/unsafe\npath",
    ]) {
      view.rerender(<ObservatoryWorkDock {...props(load, { workPageHref })} />);
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    }
  });
});
