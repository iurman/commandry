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

const ciAt = "2026-10-17T12:00:00.000Z",
  ciSha = "b".repeat(40);
const ciComponent = () => ({
  state: "available",
  readAt: ciAt,
  complete: true,
  items: [],
  errorCode: null,
  retrySeconds: null,
  headSha: ciSha,
});
function repositoryResult(legacy = false) {
  const base = "https://github.com/synthetic-owner/repository";
  const pr = {
    id: 1,
    number: 1,
    title: "Literal <script>title</script>",
    draft: false,
    updatedAt: ciAt,
    baseRef: "main",
    headRef: "branch",
    author: null,
    url: base + "/pull/1",
  };
  return {
    ...result(1),
    facet: "pull_requests",
    access: "available",
    items: [
      {
        ...result(1).items[0]!,
        kind: "github-repository",
        payload: {
          repository: {
            owner: "synthetic-owner",
            name: "repository",
            url: base,
          },
          readAt: ciAt,
          pullRequests: {
            state: "available",
            readAt: ciAt,
            complete: true,
            errorCode: null,
            retrySeconds: null,
            items: [
              legacy
                ? pr
                : {
                    ...pr,
                    headSha: ciSha,
                    requiredCheckCoverage: "unknown",
                    checkRuns: {
                      ...ciComponent(),
                      items: [
                        {
                          id: 1,
                          headSha: ciSha,
                          name: "Literal <script>check</script>",
                          status: "completed",
                          conclusion: "failure",
                          startedAt: ciAt,
                          completedAt: ciAt,
                          freshness: "fresh",
                          url: base + "/runs/1",
                        },
                      ],
                    },
                    statuses: {
                      ...ciComponent(),
                      state: "inaccessible",
                      complete: false,
                      errorCode: "OPERATIONAL_UNAUTHORIZED",
                      retrySeconds: 60,
                    },
                  },
            ],
          },
        },
      },
    ],
  };
}
describe("current-head CI in actual repository details", () => {
  it("shows a failed current-head check and independent source denial without claiming availability or a coding run", async () => {
    const load = vi.fn(async (_id: string, facet: string) =>
      facet === "pull_requests" ? repositoryResult() : result(),
    );
    render(
      <ObservatoryOperationalEvidence
        resourceId={resourceId}
        scopeKey="CI"
        repository
        loadEvidence={load}
      />,
    );
    expect(await screen.findByText(ciSha)).toBeVisible();
    expect(screen.getByText(/Literal <script>check/)).toBeVisible();
    expect(screen.getByText(/completed.*failure/)).toBeVisible();
    expect(screen.getByText(/OPERATIONAL_UNAUTHORIZED/)).toBeVisible();
    expect(screen.getByText(/Required check coverage: unknown/)).toBeVisible();
    expect(
      screen.getByText(/Pull requests do not establish an active coding run/),
    ).toBeVisible();
    expect(document.querySelector("script")).toBeNull();
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "availability" },
    });
    expect(
      await screen.findByText("unsupported / 0 reviewed sources"),
    ).toBeVisible();
    expect(screen.queryByText(/Literal <script>check/)).toBeNull();
    expect(load).toHaveBeenLastCalledWith(resourceId, "availability");
  });
  it("renders legacy PR CI as unknown instead of successful empty lists", async () => {
    render(
      <ObservatoryOperationalEvidence
        resourceId={resourceId}
        scopeKey="old-CI"
        repository
        loadEvidence={async () => repositoryResult(true)}
      />,
    );
    expect(await screen.findByText("Current head: unknown")).toBeVisible();
    expect(
      screen.getByText("Check runs: unavailable in this record."),
    ).toBeVisible();
    expect(
      screen.getByText("Commit statuses: unavailable in this record."),
    ).toBeVisible();
    expect(
      screen.queryByText(/Check runs: complete|Commit statuses: complete/),
    ).toBeNull();
  });
});

it("shows pending and neutral checks and legacy success without claiming required-check satisfaction", async () => {
  const data = repositoryResult(),
    pr = data.items[0]!.payload.pullRequests.items[0]!;
  Object.assign(pr, {
    checkRuns: {
      ...ciComponent(),
      items: [
        {
          id: 1,
          headSha: ciSha,
          name: "Queued check",
          status: "queued",
          conclusion: null,
          startedAt: null,
          completedAt: null,
          freshness: "unknown",
          url: "https://github.com/synthetic-owner/repository/runs/1",
        },
        {
          id: 2,
          headSha: ciSha,
          name: "Neutral check",
          status: "completed",
          conclusion: "neutral",
          startedAt: ciAt,
          completedAt: ciAt,
          freshness: "fresh",
          url: "https://github.com/synthetic-owner/repository/runs/2",
        },
      ],
    },
    statuses: {
      ...ciComponent(),
      items: [
        {
          id: 3,
          context: "Legacy success <script>literal</script>",
          state: "success",
          createdAt: ciAt,
          updatedAt: ciAt,
          freshness: "stale",
          url: "https://github.com/synthetic-owner/repository/commit/" + ciSha,
        },
      ],
    },
  });
  render(
    <ObservatoryOperationalEvidence
      resourceId={resourceId}
      scopeKey="mixed-CI"
      repository
      loadEvidence={async () => data}
    />,
  );
  expect(
    await screen.findByText(/queued.*conclusion unknown.*unknown/),
  ).toBeVisible();
  expect(screen.getByText("Started unknown; completed unknown.")).toBeVisible();
  expect(screen.getByText(/completed.*neutral.*fresh/)).toBeVisible();
  expect(screen.getByText(/success.*stale/)).toBeVisible();
  expect(screen.getByText(/Required check coverage: unknown/)).toBeVisible();
  expect(screen.getByRole("link", { name: "Queued check" })).toHaveAttribute(
    "href",
    "https://github.com/synthetic-owner/repository/runs/1",
  );
  expect(
    screen.getByRole("link", {
      name: "Legacy success <script>literal</script>",
    }),
  ).toHaveAttribute(
    "href",
    "https://github.com/synthetic-owner/repository/commit/" + ciSha,
  );
  expect(document.querySelector("script")).toBeNull();
  expect(
    screen.getByText(
      /Service availability and runtime observations remain independent/,
    ),
  ).toBeVisible();
});
it("discloses empty complete CI reads with unknown required coverage and source-read dates", async () => {
  const data = repositoryResult();
  Object.assign(data.items[0]!.payload.pullRequests.items[0]!, {
    checkRuns: ciComponent(),
    statuses: ciComponent(),
  });
  render(
    <ObservatoryOperationalEvidence
      resourceId={resourceId}
      scopeKey="empty-CI"
      repository
      loadEvidence={async () => data}
    />,
  );
  expect(
    await screen.findByText(
      "No visible check runs returned. Required coverage remains unknown.",
    ),
  ).toBeVisible();
  expect(
    screen.getByText(
      "No visible commit statuses returned. Required coverage remains unknown.",
    ),
  ).toBeVisible();
  expect(
    screen.getAllByText(
      /complete source read.*Source read.*not a completion time/,
    ),
  ).toHaveLength(2);
  expect(screen.getByText(/Required check coverage: unknown/)).toBeVisible();
});
