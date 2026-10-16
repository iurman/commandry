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
  foundationFindingProposalDetailSchema,
  foundationFindingProposalReviewInputSchema,
  foundationFindingProposalReviewReceiptSchema,
  type FoundationFindingProposalReviewInput,
} from "@commandry/contracts";
import { FoundationFindingProposalPanel } from "./FoundationFindingProposalPanel";
const id = (n: number) =>
  `abcdefab-cdef-4abc-8def-${String(n).padStart(12, "0")}`;
const projectId = id(1),
  captureId = id(2),
  proposalId = id(3),
  clientId = id(4),
  correlationId = id(5);
const at = "2026-10-16T12:00:00.000Z",
  reviewedAt = "2026-10-16T12:01:00.000Z";
const original = "  original\r\n<script>source()</script>";
const title = "A cited observation",
  body = "  Exact finding\r\n<script>finding()</script>";
function detail() {
  return foundationFindingProposalDetailSchema.parse({
    capture: {
      id: captureId,
      inputType: "text",
      originalContent: original,
      file: null,
      source: "foundation-client",
      author: "foundation-client:" + clientId,
      state: "unfiled",
      projectId,
      filedRecord: null,
      createdAt: at,
      filedAt: null,
    },
    suggestion: {
      id: proposalId,
      captureId,
      kind: "note",
      proposedProjectId: projectId,
      title,
      body,
      confidence: null,
      rationale: "Observed in the original source",
      ruleVersion: "agent-finding-proposal/v1",
      sourceLabel: "Agent finding proposal",
      createdAt: at,
      proposal: {
        contentDigest: "b".repeat(64),
        binding: {
          schemaVersion: 1,
          proposalId,
          captureId,
          projectId,
          environment: "test",
          clientId,
          principalId: "foundation-client:" + clientId,
          correlationId,
          submittedAt: at,
          sourceDigest: "a".repeat(64),
          proposalVersion: 1,
          proposedTitle: title,
          proposedBody: body,
          rationale: "Observed in the original source",
          citations: [
            {
              evidenceId: id(6),
              sourceKind: "capture",
              sourceId: id(7),
              sourceVersion: null,
              contentDigest: "c".repeat(64),
              selection: "whole_source",
            },
          ],
          citationsDigest: "d".repeat(64),
          runtime: null,
          model: null,
          runId: null,
        },
      },
    },
    decision: null,
  });
}
function receipt(input: FoundationFindingProposalReviewInput) {
  const approved = input.decision === "approve";
  return {
    record: foundationFindingProposalReviewReceiptSchema.parse({
      schemaVersion: 1,
      proposalId,
      captureId,
      projectId,
      environment: "test",
      decision: {
        id: id(8),
        captureId,
        suggestionId: proposalId,
        decision: input.decision,
        selectedProjectId: approved ? projectId : null,
        selectedKind: approved ? "note" : null,
        selectedTitle: approved ? input.selectedTitle : null,
        selectedBody: approved ? input.selectedBody : null,
        filedRecordId: approved ? id(9) : null,
        actor: "user:owner",
        createdAt: reviewedAt,
        provenance: {
          schemaVersion: 1,
          projectId,
          environment: "test",
          proposalVersion: 1,
          proposalDigest: input.expectedProposalDigest,
          sourceDigest: input.expectedSourceDigest,
          citationsDigest: input.expectedCitationsDigest,
          reviewedBy: "user:owner",
          correlationId,
          reason: input.reason,
        },
      },
      knowledge: approved
        ? {
            id: id(9),
            projectId,
            sourceCaptureId: captureId,
            kind: "note",
            title: input.selectedTitle,
            content: input.selectedBody,
            version: 1,
            createdAt: reviewedAt,
            updatedAt: reviewedAt,
          }
        : null,
      memory: approved
        ? {
            schemaVersion: 1,
            id: id(10),
            projectId,
            knowledgeItemId: id(9),
            version: 1,
            contentDigest: "e".repeat(64),
            content: {
              statement: input.selectedBody,
              category: "finding",
              evidenceIds: [id(11), id(6)],
              relatedMemoryIds: [],
              relationType: null,
            },
            lifecycle: "proposed",
            verification: "unverified",
            recordedBy: "user:owner",
            recordedAt: reviewedAt,
          }
        : null,
    }),
    replayed: false,
    correlationId,
  };
}
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("owner cited finding review", () => {
  it("escapes citations and proposed text, files exact selected bytes and links separate assertion review", async () => {
    const onReviewed = vi.fn();
    const fetchMock = vi.fn(async (_path: string, init?: RequestInit) =>
      init?.method === "POST"
        ? json(
            receipt(
              foundationFindingProposalReviewInputSchema.parse(
                JSON.parse(String(init.body)),
              ),
            ),
          )
        : json(detail()),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <FoundationFindingProposalPanel
        projectId={projectId}
        captureId={captureId}
        onReviewed={onReviewed}
      />,
    );
    const field = await screen.findByLabelText("Finding body");
    expect((field as HTMLTextAreaElement).value).toBe(
      body.replaceAll("\r\n", "\n"),
    );
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByText(`Evidence: ${id(6)}`)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Review reason"), {
      target: { value: "Keep as a proposed finding." },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Approve and file finding" }),
    );
    await waitFor(() => expect(onReviewed).toHaveBeenCalledTimes(1));
    const post = fetchMock.mock.calls.find(
      (call) => call[1]?.method === "POST",
    )!;
    expect(post[0]).toBe("/api/v1/foundation/workflows/findings/review");
    expect(JSON.parse(String(post[1]!.body))).toMatchObject({
      expectedCitationsDigest: "d".repeat(64),
      selectedBody: body,
      reason: "Keep as a proposed finding.",
    });
    expect(
      screen
        .getByRole("link", { name: "Review the proposed assertion" })
        .getAttribute("href"),
    ).toContain(`/foundation/memory/${id(10)}?projectId=`);
    expect(
      screen.getByText(
        /Assertion acceptance and factual verification remain separate/,
      ),
    ).toBeTruthy();
  });
  it("retains the exact private key and input across a lost response", async () => {
    const posts: RequestInit[] = [];
    const onReviewed = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_path: string, init?: RequestInit) => {
        if (init?.method !== "POST") return json(detail());
        posts.push(init);
        if (posts.length === 1) throw new Error("lost response");
        return json({
          ...receipt(
            foundationFindingProposalReviewInputSchema.parse(
              JSON.parse(String(init.body)),
            ),
          ),
          replayed: true,
        });
      }),
    );
    render(
      <FoundationFindingProposalPanel
        projectId={projectId}
        captureId={captureId}
        onReviewed={onReviewed}
      />,
    );
    await screen.findByLabelText("Finding title");
    fireEvent.change(screen.getByLabelText("Review reason"), {
      target: { value: "Evidence reviewed." },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Approve and file finding" }),
    );
    const retry = await screen.findByRole("button", {
      name: "Retry same decision",
    });
    await waitFor(() =>
      expect((retry as HTMLButtonElement).disabled).toBe(false),
    );
    expect(
      (screen.getByLabelText("Review reason") as HTMLTextAreaElement).disabled,
    ).toBe(true);
    fireEvent.click(retry);
    await waitFor(() => expect(onReviewed).toHaveBeenCalledTimes(1));
    expect(posts).toHaveLength(2);
    expect(posts[1]!.body).toBe(posts[0]!.body);
    expect(posts[1]!.headers).toEqual(posts[0]!.headers);
  });
  it("does not confirm a receipt with the wrong citation binding", async () => {
    const onReviewed = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_path: string, init?: RequestInit) => {
        if (init?.method !== "POST") return json(detail());
        const value = receipt(
          foundationFindingProposalReviewInputSchema.parse(
            JSON.parse(String(init.body)),
          ),
        );
        value.record.decision.provenance.citationsDigest = "f".repeat(64);
        return json(value);
      }),
    );
    render(
      <FoundationFindingProposalPanel
        projectId={projectId}
        captureId={captureId}
        onReviewed={onReviewed}
      />,
    );
    await screen.findByLabelText("Finding title");
    fireEvent.change(screen.getByLabelText("Review reason"), {
      target: { value: "A reason" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reject proposal" }));
    await screen.findByRole("button", { name: "Retry same decision" });
    expect(onReviewed).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("link", { name: "Review the proposed assertion" }),
    ).toBeNull();
  });
  it("ignores a delayed detail response after switching project scope", async () => {
    let resolve!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((done) => {
            resolve = done;
          }),
      ),
    );
    const props = { projectId, captureId, onReviewed: vi.fn() };
    const view = render(<FoundationFindingProposalPanel {...props} />);
    view.rerender(
      <FoundationFindingProposalPanel
        {...props}
        projectId={id(99)}
        active={false}
      />,
    );
    await act(async () => {
      resolve(json(detail()));
    });
    expect(screen.queryByLabelText("Finding title")).toBeNull();
  });
});
