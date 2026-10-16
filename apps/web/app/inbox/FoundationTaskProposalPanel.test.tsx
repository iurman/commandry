// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  foundationTaskProposalDetailSchema,
  foundationTaskProposalReviewInputSchema,
  foundationTaskProposalReviewReceiptSchema,
  type FoundationTaskProposalDetail,
  type FoundationTaskProposalReviewInput,
} from "@commandry/contracts";
import { FoundationTaskProposalPanel } from "./FoundationTaskProposalPanel";

const id = (n: number) =>
  `0ef5d360-5d30-4863-a148-${String(n).padStart(12, "0")}`;
const captureId = id(1);
const projectId = id(2);
const proposalId = id(3);
const clientId = id(4);
const key = id(5);
const correlationId = id(6);
const workId = id(7);
const at = "2026-10-16T09:00:00.000Z";
const reviewedAt = "2026-10-16T10:00:00.000Z";
const exactBody =
  "\uFEFF  proposed body\r\n<script>proposal()</script>\r\n  end  ";
const original =
  "\uFEFF  original capture\r\n<script>source()</script>\r\n  original end  ";

function detail(
  capture = captureId,
  project = projectId,
): FoundationTaskProposalDetail {
  return foundationTaskProposalDetailSchema.parse({
    capture: {
      id: capture,
      inputType: "text",
      originalContent: original,
      file: null,
      source: "foundation-client",
      author: `foundation-client:${clientId}`,
      state: "unfiled",
      projectId: project,
      filedRecord: null,
      createdAt: at,
      filedAt: null,
    },
    suggestion: {
      id: proposalId,
      captureId: capture,
      kind: "task",
      proposedProjectId: project,
      title: "\uFEFF  Suggested task  ",
      body: exactBody,
      confidence: null,
      rationale:
        "  Treat <img src=x onerror=attack()> as source text.\r\nPreserve it.  ",
      ruleVersion: "agent-task-proposal/v1",
      sourceLabel: "Agent task proposal",
      createdAt: at,
      proposal: {
        contentDigest: "b".repeat(64),
        binding: {
          schemaVersion: 1,
          proposalId,
          captureId: capture,
          projectId: project,
          environment: "test",
          clientId,
          principalId: `foundation-client:${clientId}`,
          correlationId: id(8),
          submittedAt: at,
          sourceDigest: "a".repeat(64),
          proposalVersion: 1,
          proposedTitle: "\uFEFF  Suggested task  ",
          proposedBody: exactBody,
          rationale:
            "  Treat <img src=x onerror=attack()> as source text.\r\nPreserve it.  ",
          runtime: null,
          model: null,
          runId: null,
        },
      },
    },
    decision: null,
  });
}

function inputFor(
  d: FoundationTaskProposalDetail,
  choice: "approve" | "reject" = "approve",
) {
  return foundationTaskProposalReviewInputSchema.parse({
    projectId: d.capture.projectId,
    proposalId: d.suggestion.id,
    expectedVersion: 1,
    expectedProposalDigest: d.suggestion.proposal.contentDigest,
    expectedSourceDigest: d.suggestion.proposal.binding.sourceDigest,
    decision: choice,
    ...(choice === "approve"
      ? { selectedTitle: d.suggestion.title, selectedBody: d.suggestion.body }
      : {}),
  });
}

function receipt(
  d: FoundationTaskProposalDetail,
  input: FoundationTaskProposalReviewInput,
  replayed = false,
) {
  const approved = input.decision === "approve";
  const decision = {
    id: id(9),
    captureId: d.capture.id,
    suggestionId: input.proposalId,
    decision: input.decision,
    selectedProjectId: approved ? input.projectId : null,
    selectedKind: approved ? "task" : null,
    selectedTitle: approved ? input.selectedTitle : null,
    selectedBody: approved ? input.selectedBody : null,
    actor: "user:owner-review-fixture",
    createdAt: reviewedAt,
    filedRecordId: approved ? workId : null,
    provenance: {
      schemaVersion: 1,
      projectId: input.projectId,
      environment: d.suggestion.proposal.binding.environment,
      proposalVersion: input.expectedVersion,
      proposalDigest: input.expectedProposalDigest,
      sourceDigest: input.expectedSourceDigest,
      reviewedBy: "user:owner-review-fixture",
      correlationId,
    },
  };
  const record = foundationTaskProposalReviewReceiptSchema.parse({
    schemaVersion: 1,
    proposalId: input.proposalId,
    captureId: d.capture.id,
    projectId: input.projectId,
    environment: d.suggestion.proposal.binding.environment,
    decision,
    work: approved
      ? {
          id: workId,
          projectId: input.projectId,
          sourceCaptureId: d.capture.id,
          generatedFromWorkItemId: null,
          title: input.selectedTitle,
          description: input.selectedBody,
          workType: "task",
          assigneeKind: "unassigned",
          assigneeAgentId: null,
          assigneeLabel: null,
          status: "open",
          priority: null,
          dueOn: null,
          contextLink: null,
          createdAt: reviewedAt,
          updatedAt: reviewedAt,
        }
      : null,
  });
  return { record, replayed, correlationId };
}

function terminal(choice: "approve" | "reject") {
  const d = detail();
  const record = receipt(d, inputFor(d, choice)).record;
  return foundationTaskProposalDetailSchema.parse({
    ...d,
    capture:
      choice === "approve"
        ? {
            ...d.capture,
            state: "filed",
            filedRecord: { kind: "task", id: workId },
            filedAt: reviewedAt,
          }
        : d.capture,
    decision: record.decision,
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
function posts(mock: ReturnType<typeof vi.fn>) {
  return mock.mock.calls.filter(
    (call) => (call[1] as RequestInit | undefined)?.method === "POST",
  );
}
function submitted(mock: ReturnType<typeof vi.fn>, index = 0) {
  const call = posts(mock)[index]!;
  return {
    path: call[0],
    init: call[1] as RequestInit,
    input: foundationTaskProposalReviewInputSchema.parse(
      JSON.parse(String((call[1] as RequestInit).body)),
    ),
  };
}
async function ready() {
  await screen.findByLabelText("Task title");
}
function approve() {
  fireEvent.click(
    screen.getByRole("button", { name: "Approve and create task" }),
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("owner task proposal review", () => {
  it("loads bound strict detail, escapes proposed text and preserves exact suggestion/source independently", async () => {
    const d = detail();
    const onReviewed = vi.fn();
    const fetchMock = vi.fn<
      (path: string, init?: RequestInit) => Promise<Response>
    >(async () => json(d));
    vi.stubGlobal("fetch", fetchMock);
    const view = render(
      <>
        <pre data-testid="source">{d.capture.originalContent}</pre>
        <FoundationTaskProposalPanel
          captureId={captureId}
          projectId={projectId}
          onReviewed={onReviewed}
        />
      </>,
    );
    expect(screen.getByRole("status").textContent).toBe(
      "Loading proposal review...",
    );
    expect(
      screen.queryByRole("button", { name: "Approve and create task" }),
    ).toBeNull();
    await ready();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/v1/foundation/task-proposals/by-capture/${captureId}?projectId=${projectId}`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      credentials: "same-origin",
      cache: "no-store",
    });
    expect(screen.getByText("Pending review")).toBeTruthy();
    expect(screen.getByText("Unverified source content")).toBeTruthy();
    expect(screen.getByText(`foundation-client:${clientId}`)).toBeTruthy();
    const proposedBody = screen.getByText(
      (_, node) => node?.tagName === "P" && node.textContent === exactBody,
    );
    expect(proposedBody.textContent).toBe(exactBody);
    expect(screen.getByTestId("source").textContent).toBe(original);
    expect(view.container.querySelector("script")).toBeNull();
    expect(view.container.querySelector("img")).toBeNull();
    fireEvent.change(screen.getByLabelText("Task title"), {
      target: { value: "  Owner selected title  " },
    });
    fireEvent.change(screen.getByLabelText("Task body"), {
      target: { value: "Owner edited body" },
    });
    view.rerender(
      <>
        <pre data-testid="source">{d.capture.originalContent}</pre>
        <FoundationTaskProposalPanel
          captureId={captureId}
          projectId={projectId}
          onReviewed={onReviewed}
        />
      </>,
    );
    expect(
      (screen.getByLabelText("Task title") as HTMLTextAreaElement).value,
    ).toBe("  Owner selected title  ");
    expect(proposedBody.textContent).toBe(exactBody);
    expect(screen.getByTestId("source").textContent).toBe(original);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onReviewed).not.toHaveBeenCalled();
  });

  it("approves exact selected whitespace with a canonical key and validates the historical Work receipt", async () => {
    const d = detail();
    const onReviewed = vi.fn();
    vi.spyOn(crypto, "randomUUID").mockReturnValue(key);
    const selectedTitle = "\uFEFF  Owner selected title  ";
    const fetchMock = vi.fn(async (_path: string, init?: RequestInit) =>
      init?.method === "POST"
        ? json(
            receipt(
              d,
              foundationTaskProposalReviewInputSchema.parse(
                JSON.parse(String(init.body)),
              ),
            ),
          )
        : json(d),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <FoundationTaskProposalPanel
        captureId={captureId}
        projectId={projectId}
        onReviewed={onReviewed}
      />,
    );
    await ready();
    fireEvent.change(screen.getByLabelText("Task title"), {
      target: { value: selectedTitle },
    });
    approve();
    await screen.findByText("Approved");
    const sent = submitted(fetchMock);
    expect(sent.path).toBe("/api/v1/foundation/task-proposals/review");
    expect(sent.init).toMatchObject({
      credentials: "same-origin",
      cache: "no-store",
      headers: { "content-type": "application/json", "idempotency-key": key },
    });
    expect(sent.input).toEqual({ ...inputFor(d), selectedTitle });
    expect(sent.init.body).toBe(
      JSON.stringify({ ...inputFor(d), selectedTitle }),
    );
    expect(sent.input.decision === "approve" && sent.input.selectedBody).toBe(
      exactBody,
    );
    expect(
      screen
        .getByRole("link", { name: "View project tasks" })
        .getAttribute("href"),
    ).toBe(`/work?projectId=${projectId}`);
    expect(screen.queryByLabelText("Task title")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Reject proposal" }),
    ).toBeNull();
    expect(onReviewed).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects without selected fields, creates no Work link and retains the original", async () => {
    const d = detail();
    const onReviewed = vi.fn();
    const fetchMock = vi.fn(async (_path: string, init?: RequestInit) =>
      init?.method === "POST"
        ? json(receipt(d, inputFor(d, "reject")))
        : json(d),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <FoundationTaskProposalPanel
        captureId={captureId}
        projectId={projectId}
        onReviewed={onReviewed}
      />,
    );
    await ready();
    fireEvent.change(screen.getByLabelText("Task title"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reject proposal" }));
    await screen.findByText("Rejected");
    expect(submitted(fetchMock).input).toEqual(inputFor(d, "reject"));
    expect(screen.getByText("The original capture is retained.")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
    expect(onReviewed).toHaveBeenCalledTimes(1);
  });

  for (const failure of ["network", "malformed", "server"] as const) {
    it(`retains exact input and key after ${failure} uncertainty and retries only explicitly`, async () => {
      const d = detail();
      const onReviewed = vi.fn();
      const random = vi.spyOn(crypto, "randomUUID").mockReturnValue(key);
      let count = 0;
      const fetchMock = vi.fn(async (_path: string, init?: RequestInit) => {
        if (init?.method !== "POST") return json(d);
        count += 1;
        if (count === 1) {
          if (failure === "network")
            throw new TypeError("Synthetic lost delivery");
          return failure === "malformed"
            ? json({ record: null, replayed: false, correlationId })
            : json({ message: "Synthetic unavailable" }, 503);
        }
        return json(
          receipt(
            d,
            foundationTaskProposalReviewInputSchema.parse(
              JSON.parse(String(init.body)),
            ),
            true,
          ),
        );
      });
      vi.stubGlobal("fetch", fetchMock);
      render(
        <FoundationTaskProposalPanel
          captureId={captureId}
          projectId={projectId}
          onReviewed={onReviewed}
        />,
      );
      await ready();
      fireEvent.change(screen.getByLabelText("Task title"), {
        target: { value: "  Saved selection  " },
      });
      approve();
      await screen.findByText(
        "This decision may have been saved. Retry the same decision to confirm its outcome.",
      );
      expect(posts(fetchMock)).toHaveLength(1);
      expect(
        (screen.getByLabelText("Task title") as HTMLTextAreaElement).disabled,
      ).toBe(true);
      expect(
        (screen.getByLabelText("Task body") as HTMLTextAreaElement).disabled,
      ).toBe(true);
      expect(
        screen.queryByRole("button", { name: "Reject proposal" }),
      ).toBeNull();
      expect(onReviewed).not.toHaveBeenCalled();
      fireEvent.click(
        screen.getByRole("button", { name: "Retry same decision" }),
      );
      await screen.findByText("Approved");
      expect(posts(fetchMock)).toHaveLength(2);
      expect(submitted(fetchMock, 1).init.body).toBe(
        submitted(fetchMock, 0).init.body,
      );
      expect(submitted(fetchMock, 1).init.headers).toEqual(
        submitted(fetchMock, 0).init.headers,
      );
      expect(random).toHaveBeenCalledTimes(1);
      expect(onReviewed).toHaveBeenCalledTimes(1);
    });
  }

  it("prevents duplicate decisions and duplicate retry clicks while delivery is pending", async () => {
    const d = detail();
    const pending = deferred<Response>();
    const fetchMock = vi.fn(async (_path: string, init?: RequestInit) =>
      init?.method === "POST" ? pending.promise : json(d),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onReviewed = vi.fn();
    render(
      <FoundationTaskProposalPanel
        captureId={captureId}
        projectId={projectId}
        onReviewed={onReviewed}
      />,
    );
    await ready();
    const form = screen.getByLabelText("Task title").closest("form")!;
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(posts(fetchMock)).toHaveLength(1);
    const retry = screen.getByRole("button", { name: "Retry same decision" });
    expect((retry as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(retry);
    expect(posts(fetchMock)).toHaveLength(1);
    await act(async () => pending.resolve(json(receipt(d, inputFor(d)))));
    await screen.findByText("Approved");
    expect(onReviewed).toHaveBeenCalledTimes(1);
  });

  for (const mismatch of [
    "capture",
    "environment",
    "proposalDigest",
    "sourceDigest",
    "selected",
    "actor",
    "correlation",
    "envelope",
  ] as const) {
    it(`withholds success for a mismatched ${mismatch} receipt`, async () => {
      const d = detail();
      const onReviewed = vi.fn();
      const value = receipt(d, inputFor(d));
      if (mismatch === "capture") {
        value.record.captureId = id(20);
        value.record.decision.captureId = id(20);
        value.record.work!.sourceCaptureId = id(20);
      }
      if (mismatch === "environment") {
        value.record.environment = "local";
        value.record.decision.provenance.environment = "local";
      }
      if (mismatch === "proposalDigest")
        value.record.decision.provenance.proposalDigest = "c".repeat(64);
      if (mismatch === "sourceDigest")
        value.record.decision.provenance.sourceDigest = "c".repeat(64);
      if (mismatch === "selected") {
        value.record.decision.selectedTitle = "A different task";
        value.record.work!.title = "A different task";
      }
      if (mismatch === "actor")
        value.record.decision.provenance.reviewedBy = "user:different-owner";
      if (mismatch === "correlation") value.correlationId = id(21);
      const malformed =
        mismatch === "envelope" ? { ...value, unexpected: true } : value;
      const fetchMock = vi.fn(async (_path: string, init?: RequestInit) =>
        json(init?.method === "POST" ? malformed : d),
      );
      vi.stubGlobal("fetch", fetchMock);
      render(
        <FoundationTaskProposalPanel
          captureId={captureId}
          projectId={projectId}
          onReviewed={onReviewed}
        />,
      );
      await ready();
      approve();
      await screen.findByText(
        "This decision may have been saved. Retry the same decision to confirm its outcome.",
      );
      expect(onReviewed).not.toHaveBeenCalled();
      expect(screen.queryByText("Approved")).toBeNull();
      expect(screen.queryByRole("link")).toBeNull();
    });
  }

  it("treats a 409 as known rejection and reloads safely without losing the edited draft", async () => {
    const d = detail();
    const onReviewed = vi.fn();
    const random = vi
      .spyOn(crypto, "randomUUID")
      .mockReturnValueOnce(key)
      .mockReturnValueOnce(id(22));
    let post = 0;
    const fetchMock = vi.fn(async (_path: string, init?: RequestInit) => {
      if (init?.method !== "POST") return json(d);
      post += 1;
      return post === 1
        ? json({ message: "Do not display server-supplied content" }, 409)
        : json(
            receipt(
              d,
              foundationTaskProposalReviewInputSchema.parse(
                JSON.parse(String(init.body)),
              ),
            ),
          );
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <FoundationTaskProposalPanel
        captureId={captureId}
        projectId={projectId}
        onReviewed={onReviewed}
      />,
    );
    await ready();
    fireEvent.change(screen.getByLabelText("Task title"), {
      target: { value: "  Keep my draft  " },
    });
    approve();
    await screen.findByRole("alert");
    expect(
      screen.queryByRole("button", { name: "Retry same decision" }),
    ).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: "Approve and create task",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Reload review" }));
    await ready();
    expect(
      (screen.getByLabelText("Task title") as HTMLTextAreaElement).value,
    ).toBe("  Keep my draft  ");
    approve();
    await screen.findByText("Approved");
    expect(random).toHaveBeenCalledTimes(2);
    expect(submitted(fetchMock, 0).init.headers).not.toEqual(
      submitted(fetchMock, 1).init.headers,
    );
    expect(onReviewed).toHaveBeenCalledTimes(1);
  });

  for (const status of [400, 401, 403, 404]) {
    it(`handles known ${status} rejection without claiming success or uncertain retry`, async () => {
      const d = detail();
      const onReviewed = vi.fn();
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_path: string, init?: RequestInit) =>
          init?.method === "POST" ? json({}, status) : json(d),
        ),
      );
      render(
        <FoundationTaskProposalPanel
          captureId={captureId}
          projectId={projectId}
          onReviewed={onReviewed}
        />,
      );
      await ready();
      approve();
      await screen.findByRole("alert");
      expect(onReviewed).not.toHaveBeenCalled();
      expect(
        screen.queryByRole("button", { name: "Retry same decision" }),
      ).toBeNull();
      if (status === 401 || status === 403)
        expect(
          screen.getByRole("button", { name: "Retry after sign-in" }),
        ).toBeTruthy();
      expect(
        (screen.getByLabelText("Task body") as HTMLTextAreaElement).disabled,
      ).toBe(false);
    });
  }

  it("ignores an old slow read and aborts it when the capture changes", async () => {
    const slow = deferred<Response>();
    const second = detail(id(30), projectId);
    const fetchMock = vi.fn<
      (path: string, init?: RequestInit) => Promise<Response>
    >(async (path) => (path.includes(captureId) ? slow.promise : json(second)));
    vi.stubGlobal("fetch", fetchMock);
    const view = render(
      <FoundationTaskProposalPanel
        captureId={captureId}
        projectId={projectId}
        onReviewed={vi.fn()}
      />,
    );
    view.rerender(
      <FoundationTaskProposalPanel
        captureId={id(30)}
        projectId={projectId}
        onReviewed={vi.fn()}
      />,
    );
    await ready();
    await act(async () => slow.resolve(json(detail())));
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).signal?.aborted).toBe(
      true,
    );
    fireEvent.change(screen.getByLabelText("Task title"), {
      target: { value: "Second capture draft" },
    });
    expect(
      (screen.getByLabelText("Task title") as HTMLTextAreaElement).value,
    ).toBe("Second capture draft");
  });

  it("blocks a new selection during an old mutation and suppresses its eventual feedback", async () => {
    const d = detail();
    const second = detail(id(31), id(32));
    const slow = deferred<Response>();
    const onReviewed = vi.fn();
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) =>
      init?.method === "POST"
        ? slow.promise
        : json(path.includes(captureId) ? d : second),
    );
    vi.stubGlobal("fetch", fetchMock);
    const view = render(
      <FoundationTaskProposalPanel
        captureId={captureId}
        projectId={projectId}
        onReviewed={onReviewed}
      />,
    );
    await ready();
    approve();
    view.rerender(
      <FoundationTaskProposalPanel
        captureId={second.capture.id}
        projectId={second.capture.projectId}
        onReviewed={onReviewed}
      />,
    );
    await ready();
    expect(
      (
        screen.getByRole("button", {
          name: "Approve and create task",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await act(async () => slow.resolve(json(receipt(d, inputFor(d)))));
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Approve and create task",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    expect(screen.queryByText("Approved")).toBeNull();
    expect(onReviewed).not.toHaveBeenCalled();
    expect(posts(fetchMock)).toHaveLength(1);
  });

  it("keeps an uncertain old decision separate when another capture is selected", async () => {
    const d = detail();
    const second = detail(id(33), id(34));
    const slow = deferred<Response>();
    const onReviewed = vi.fn();
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) =>
      init?.method === "POST"
        ? slow.promise
        : json(path.includes(captureId) ? d : second),
    );
    vi.stubGlobal("fetch", fetchMock);
    const view = render(
      <FoundationTaskProposalPanel
        captureId={captureId}
        projectId={projectId}
        onReviewed={onReviewed}
      />,
    );
    await ready();
    approve();
    view.rerender(
      <FoundationTaskProposalPanel
        captureId={second.capture.id}
        projectId={second.capture.projectId}
        onReviewed={onReviewed}
      />,
    );
    await ready();
    await act(async () => slow.resolve(json({}, 503)));
    expect(
      screen.getByText(
        "A decision for another capture is still pending. Return to that capture to resolve it before reviewing another.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Retry same decision" }),
    ).toBeNull();
    expect(
      (screen.getByLabelText("Task title") as HTMLTextAreaElement).disabled,
    ).toBe(true);
    expect(onReviewed).not.toHaveBeenCalled();
  });

  for (const mismatch of ["capture", "project", "binding"] as const) {
    it(`withholds actions for a read with wrong ${mismatch} binding`, async () => {
      const d = detail(
        mismatch === "capture" ? id(40) : captureId,
        mismatch === "project" ? id(41) : projectId,
      );
      if (mismatch === "binding")
        d.suggestion.proposal.binding.principalId =
          "foundation-client:" + id(42);
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => json(d)),
      );
      render(
        <FoundationTaskProposalPanel
          captureId={captureId}
          projectId={projectId}
          onReviewed={vi.fn()}
        />,
      );
      await screen.findByRole("alert");
      expect(screen.queryByLabelText("Task title")).toBeNull();
      expect(screen.queryByText("Pending review")).toBeNull();
    });
  }

  for (const status of [401, 404, 503]) {
    it(`supports a retry after read ${status} without retaining actionable stale detail`, async () => {
      let reads = 0;
      const fetchMock = vi.fn(async () =>
        ++reads === 1 ? json({}, status) : json(detail()),
      );
      vi.stubGlobal("fetch", fetchMock);
      render(
        <FoundationTaskProposalPanel
          captureId={captureId}
          projectId={projectId}
          onReviewed={vi.fn()}
        />,
      );
      const retry = await screen.findByRole("button", {
        name: status === 401 ? "Retry after sign-in" : "Reload review",
      });
      expect(screen.queryByLabelText("Task title")).toBeNull();
      fireEvent.click(retry);
      await ready();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  }

  for (const choice of ["approve", "reject"] as const) {
    it(`renders a terminal ${choice} read with actual reviewer and no resubmission controls`, async () => {
      const d = terminal(choice);
      const onReviewed = vi.fn();
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => json(d)),
      );
      render(
        <FoundationTaskProposalPanel
          captureId={captureId}
          projectId={projectId}
          onReviewed={onReviewed}
        />,
      );
      await screen.findByText(choice === "approve" ? "Approved" : "Rejected");
      expect(screen.getByText("user:owner-review-fixture")).toBeTruthy();
      expect(screen.getByText(reviewedAt)).toBeTruthy();
      expect(screen.queryByLabelText("Task title")).toBeNull();
      expect(screen.queryByRole("button")).toBeNull();
      expect(screen.queryByText("Suggested title")).toBeNull();
      expect(onReviewed).not.toHaveBeenCalled();
    });
  }

  it("keeps reentered A non-actionable while both B and the fresh A read remain pending", async () => {
    const d = detail();
    const second = detail(id(80), id(81));
    const slowB = deferred<Response>();
    const freshA = deferred<Response>();
    let readsA = 0;
    const onReviewed = vi.fn();
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const input = foundationTaskProposalReviewInputSchema.parse(
          JSON.parse(String(init.body)),
        );
        return json(receipt(d, input));
      }
      if (!path.includes(captureId)) return slowB.promise;
      readsA += 1;
      return readsA === 1 ? json(d) : freshA.promise;
    });
    vi.stubGlobal("fetch", fetchMock);
    const view = render(
      <FoundationTaskProposalPanel
        captureId={captureId}
        projectId={projectId}
        onReviewed={onReviewed}
      />,
    );
    await ready();
    const oldApprove = screen.getByRole("button", {
      name: "Approve and create task",
    });
    view.rerender(
      <FoundationTaskProposalPanel
        captureId={second.capture.id}
        projectId={second.capture.projectId}
        onReviewed={onReviewed}
      />,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    view.rerender(
      <FoundationTaskProposalPanel
        captureId={captureId}
        projectId={projectId}
        onReviewed={onReviewed}
      />,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(screen.getByRole("status").textContent).toBe(
      "Loading proposal review...",
    );
    expect(screen.queryByLabelText("Task title")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Approve and create task" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Reject proposal" }),
    ).toBeNull();
    expect(view.container.querySelector("form")).toBeNull();
    fireEvent.click(oldApprove);
    expect(posts(fetchMock)).toHaveLength(0);
    await act(async () => slowB.resolve(json(second)));
    expect(screen.getByRole("status").textContent).toBe(
      "Loading proposal review...",
    );
    expect(screen.queryByLabelText("Task title")).toBeNull();
    expect(posts(fetchMock)).toHaveLength(0);
    await act(async () => freshA.resolve(json(d)));
    await ready();
    expect(
      (screen.getByLabelText("Task title") as HTMLTextAreaElement).value,
    ).toBe(d.suggestion.title);
    expect(
      (
        screen.getByRole("button", {
          name: "Approve and create task",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    approve();
    await screen.findByText("Approved");
    expect(posts(fetchMock)).toHaveLength(1);
    expect(submitted(fetchMock).input).toEqual(inputFor(d));
    expect(onReviewed).toHaveBeenCalledTimes(1);
  });

  it("suppresses an old response after switching away and back to the same capture", async () => {
    const d = detail();
    const second = detail(id(60), id(61));
    const slow = deferred<Response>();
    const onReviewed = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string, init?: RequestInit) =>
        init?.method === "POST"
          ? slow.promise
          : json(path.includes(captureId) ? d : second),
      ),
    );
    const view = render(
      <FoundationTaskProposalPanel
        captureId={captureId}
        projectId={projectId}
        onReviewed={onReviewed}
      />,
    );
    await ready();
    approve();
    view.rerender(
      <FoundationTaskProposalPanel
        captureId={second.capture.id}
        projectId={second.capture.projectId}
        onReviewed={onReviewed}
      />,
    );
    await ready();
    view.rerender(
      <FoundationTaskProposalPanel
        captureId={captureId}
        projectId={projectId}
        onReviewed={onReviewed}
      />,
    );
    await ready();
    await act(async () => slow.resolve(json(receipt(d, inputFor(d)))));
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Approve and create task",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    expect(onReviewed).not.toHaveBeenCalled();
    expect(screen.queryByText("Approved")).toBeNull();
  });

  it("withholds success for a noncanonical correlation identifier", async () => {
    const d = detail();
    const value = receipt(d, inputFor(d));
    value.correlationId = value.correlationId.toUpperCase();
    value.record.decision.provenance.correlationId = value.correlationId;
    const onReviewed = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_path: string, init?: RequestInit) =>
        json(init?.method === "POST" ? value : d),
      ),
    );
    render(
      <FoundationTaskProposalPanel
        captureId={captureId}
        projectId={projectId}
        onReviewed={onReviewed}
      />,
    );
    await ready();
    approve();
    await screen.findByText(
      "This decision may have been saved. Retry the same decision to confirm its outcome.",
    );
    expect(onReviewed).not.toHaveBeenCalled();
  });

  it("does not retain actionable detail when an explicit reload fails", async () => {
    const d = detail();
    let reads = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_path: string, init?: RequestInit) => {
        if (init?.method === "POST") return json({}, 409);
        reads += 1;
        return reads === 1 ? json(d) : json({}, 503);
      }),
    );
    render(
      <FoundationTaskProposalPanel
        captureId={captureId}
        projectId={projectId}
        onReviewed={vi.fn()}
      />,
    );
    await ready();
    approve();
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Reload review" }));
    await screen.findByText(
      "Proposal review is unavailable. Try loading it again.",
    );
    expect(screen.queryByLabelText("Task title")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Approve and create task" }),
    ).toBeNull();
  });

  it("retries an uncertain rejection with the identical decision and no selected fields", async () => {
    const d = detail();
    let decisions = 0;
    const fetchMock = vi.fn(async (_path: string, init?: RequestInit) => {
      if (init?.method !== "POST") return json(d);
      decisions += 1;
      return decisions === 1
        ? json({}, 500)
        : json(receipt(d, inputFor(d, "reject"), true));
    });
    vi.stubGlobal("fetch", fetchMock);
    const onReviewed = vi.fn();
    render(
      <FoundationTaskProposalPanel
        captureId={captureId}
        projectId={projectId}
        onReviewed={onReviewed}
      />,
    );
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Reject proposal" }));
    await screen.findByText(
      "This decision may have been saved. Retry the same decision to confirm its outcome.",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Retry same decision" }),
    );
    await screen.findByText("Rejected");
    expect(submitted(fetchMock, 1).input).toEqual(inputFor(d, "reject"));
    expect(submitted(fetchMock, 1).init.body).toBe(
      submitted(fetchMock, 0).init.body,
    );
    expect(submitted(fetchMock, 1).init.headers).toEqual(
      submitted(fetchMock, 0).init.headers,
    );
    expect(onReviewed).toHaveBeenCalledTimes(1);
  });

  it("validates edited task fields before preparing a mutation", async () => {
    const fetchMock = vi.fn(async () => json(detail()));
    const random = vi.spyOn(crypto, "randomUUID");
    vi.stubGlobal("fetch", fetchMock);
    render(
      <FoundationTaskProposalPanel
        captureId={captureId}
        projectId={projectId}
        onReviewed={vi.fn()}
      />,
    );
    await ready();
    fireEvent.change(screen.getByLabelText("Task title"), {
      target: { value: "   " },
    });
    fireEvent.submit(screen.getByLabelText("Task title").closest("form")!);
    await screen.findByRole("alert");
    expect(posts(fetchMock)).toHaveLength(0);
    expect(random).not.toHaveBeenCalled();
    expect(
      (screen.getByLabelText("Task title") as HTMLTextAreaElement).value,
    ).toBe("   ");
  });

  it("restores the frozen submitted draft after returning to an uncertain capture", async () => {
    const d = detail();
    const second = detail(id(70), id(71));
    let decisions = 0;
    const onReviewed = vi.fn();
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      if (init?.method !== "POST")
        return json(path.includes(captureId) ? d : second);
      decisions += 1;
      return decisions === 1
        ? json({}, 503)
        : json(
            receipt(
              d,
              foundationTaskProposalReviewInputSchema.parse(
                JSON.parse(String(init.body)),
              ),
              true,
            ),
          );
    });
    vi.stubGlobal("fetch", fetchMock);
    const view = render(
      <FoundationTaskProposalPanel
        captureId={captureId}
        projectId={projectId}
        onReviewed={onReviewed}
      />,
    );
    await ready();
    fireEvent.change(screen.getByLabelText("Task title"), {
      target: { value: "  Frozen owner selection  " },
    });
    approve();
    await screen.findByText(
      "This decision may have been saved. Retry the same decision to confirm its outcome.",
    );
    view.rerender(
      <FoundationTaskProposalPanel
        captureId={second.capture.id}
        projectId={second.capture.projectId}
        onReviewed={onReviewed}
      />,
    );
    await ready();
    view.rerender(
      <FoundationTaskProposalPanel
        captureId={captureId}
        projectId={projectId}
        onReviewed={onReviewed}
      />,
    );
    await ready();
    expect(
      (screen.getByLabelText("Task title") as HTMLTextAreaElement).value,
    ).toBe("  Frozen owner selection  ");
    expect(
      (screen.getByLabelText("Task title") as HTMLTextAreaElement).disabled,
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Retry same decision" }),
    );
    await screen.findByText("Approved");
    expect(submitted(fetchMock, 1).init.body).toBe(
      submitted(fetchMock, 0).init.body,
    );
    expect(submitted(fetchMock, 1).init.headers).toEqual(
      submitted(fetchMock, 0).init.headers,
    );
    expect(onReviewed).toHaveBeenCalledTimes(1);
  });

  it("uses an authoritative terminal read without exposing retry or submission controls", async () => {
    const d = detail();
    const second = detail(id(72), id(73));
    let originalReads = 0;
    const onReviewed = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string, init?: RequestInit) => {
        if (init?.method === "POST") return json({}, 503);
        if (!path.includes(captureId)) return json(second);
        originalReads += 1;
        return json(originalReads === 1 ? d : terminal("approve"));
      }),
    );
    const view = render(
      <FoundationTaskProposalPanel
        captureId={captureId}
        projectId={projectId}
        onReviewed={onReviewed}
      />,
    );
    await ready();
    approve();
    await screen.findByText(
      "This decision may have been saved. Retry the same decision to confirm its outcome.",
    );
    view.rerender(
      <FoundationTaskProposalPanel
        captureId={second.capture.id}
        projectId={second.capture.projectId}
        onReviewed={onReviewed}
      />,
    );
    await ready();
    view.rerender(
      <FoundationTaskProposalPanel
        captureId={captureId}
        projectId={projectId}
        onReviewed={onReviewed}
      />,
    );
    await screen.findByText("Approved");
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("user:owner-review-fixture")).toBeTruthy();
    expect(onReviewed).not.toHaveBeenCalled();
  });

  it("ignores a mutation response after unmount", async () => {
    const d = detail();
    const slow = deferred<Response>();
    const onReviewed = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_path: string, init?: RequestInit) =>
        init?.method === "POST" ? slow.promise : json(d),
      ),
    );
    const view = render(
      <FoundationTaskProposalPanel
        captureId={captureId}
        projectId={projectId}
        onReviewed={onReviewed}
      />,
    );
    await ready();
    approve();
    view.unmount();
    await act(async () => slow.resolve(json(receipt(d, inputFor(d)))));
    expect(onReviewed).not.toHaveBeenCalled();
  });
});

it("suspends a retained panel without fetching or allowing its stale form", async () => {
  const d = detail();
  const fresh = deferred<Response>();
  let gets = 0;
  const fetchMock = vi.fn(async () => (++gets === 1 ? json(d) : fresh.promise));
  vi.stubGlobal("fetch", fetchMock);
  const props = { captureId, projectId, onReviewed: vi.fn() };
  const view = render(<FoundationTaskProposalPanel {...props} />);
  await ready();
  view.rerender(<FoundationTaskProposalPanel {...props} active={false} />);
  expect(screen.queryByRole("heading")).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  view.rerender(<FoundationTaskProposalPanel {...props} active />);
  expect(screen.queryByLabelText("Task title")).toBeNull();
  expect(screen.getByText("Loading proposal review...")).toBeTruthy();
  await act(async () => fresh.resolve(json(d)));
  await ready();
  expect(posts(fetchMock)).toHaveLength(0);
});
it("retains an uncertain decision exactly while the parent displays another capture", async () => {
  const d = detail();
  let attempts = 0;
  const fetchMock = vi.fn(async (_path: string, init?: RequestInit) => {
    if (init?.method !== "POST") return json(d);
    attempts++;
    if (attempts === 1) throw new Error("wire lost");
    return json(
      receipt(
        d,
        foundationTaskProposalReviewInputSchema.parse(
          JSON.parse(String(init.body)),
        ),
      ),
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  const props = { captureId, projectId, onReviewed: vi.fn() };
  const view = render(<FoundationTaskProposalPanel {...props} />);
  await ready();
  approve();
  await screen.findByText(
    "This decision may have been saved. Retry the same decision to confirm its outcome.",
  );
  const first = submitted(fetchMock).init;
  view.rerender(<FoundationTaskProposalPanel {...props} active={false} />);
  view.rerender(<FoundationTaskProposalPanel {...props} active />);
  await screen.findByRole("button", { name: "Retry same decision" });
  fireEvent.click(screen.getByRole("button", { name: "Retry same decision" }));
  await screen.findByText("Approved");
  const second = submitted(fetchMock, 1).init;
  expect(second.body).toEqual(first.body);
  expect(second.headers).toEqual(first.headers);
  expect(props.onReviewed).toHaveBeenCalledTimes(1);
});
