// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  foundationOnboardingDetailSchema,
  foundationOnboardingPreviewSchema,
  foundationOnboardingDecisionSchema,
  foundationOnboardingOutcomeSchema,
  type FoundationOnboardingDecision,
} from "@commandry/contracts";
import { FoundationWorkflowReview } from "./FoundationWorkflowReview";
const id = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const projectId = id(1),
  proposalId = id(2),
  hostId = id(3),
  correlationId = id(4);
const at = "2026-10-16T12:00:00.000Z";
const proposal = {
  schemaVersion: 1,
  id: proposalId,
  version: 1,
  projectId,
  environment: "test",
  recordedBy: "foundation-client:" + id(5),
  recordedAt: at,
  contentDigest: "a".repeat(64),
  target: { mode: "reuse", resourceId: hostId },
  relationship: "supports",
  rationale: "Inspect host <script>source()</script>",
  evidenceIds: [],
};
const host = {
  id: hostId,
  kind: "host",
  name: "Existing build host",
  subtype: "vps",
  parentResourceId: null,
  state: null,
  externalUrl: null,
  lastObservedAt: null,
};
const preview = foundationOnboardingPreviewSchema.parse({
  schemaVersion: 1,
  projectId,
  proposalId,
  proposalDigest: proposal.contentDigest,
  evaluatedAt: at,
  preconditions: { resource: host, link: null, identityResourceId: null },
  preconditionsDigest: "b".repeat(64),
  previewDigest: "c".repeat(64),
  blockers: [],
  canApply: true,
});
const detail = (decision: FoundationOnboardingDecision | null = null) =>
  foundationOnboardingDetailSchema.parse({
    schemaVersion: 1,
    proposal,
    currentDecision: decision,
    outcome: null,
  });
const project = {
  id: projectId,
  name: "Test project",
  summary: null,
  type: "general",
  lifecycle: "active",
  createdAt: at,
  updatedAt: at,
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
function fixture(
  options: { lost?: boolean; conflict?: boolean; corrupt?: boolean } = {},
) {
  let decision: FoundationOnboardingDecision | null = null;
  const posts: { path: string; init: RequestInit }[] = [];
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    const url = new URL(path, "http://localhost");
    if (url.pathname === "/api/v1/projects")
      return json({ items: [project], nextCursor: null });
    if (init?.method === "POST") {
      posts.push({ path, init });
      if (options.conflict) return json({ code: "VERSION_CONFLICT" }, 409);
      const input = JSON.parse(String(init.body)) as Record<string, unknown>;
      if (url.pathname.endsWith("/review")) {
        decision = foundationOnboardingDecisionSchema.parse({
          ...input,
          schemaVersion: 1,
          id: id(6),
          version: Number(input.expectedDecisionVersion) + 1,
          recordedBy: "user:owner",
          recordedAt: at,
          contentDigest: "d".repeat(64),
          preconditions: preview.preconditions,
        });
        if (options.lost && posts.length === 1)
          throw new Error("lost response after commit");
        return json({
          record: options.corrupt
            ? { ...decision, reason: "Different reason" }
            : decision,
          replayed: posts.length > 1,
          correlationId,
        });
      }
      const record = foundationOnboardingOutcomeSchema.parse({
        schemaVersion: 1,
        id: id(7),
        projectId,
        proposalId,
        proposalVersion: 1,
        proposalDigest: proposal.contentDigest,
        decisionId: decision!.id,
        decisionVersion: decision!.version,
        decisionDigest: decision!.contentDigest,
        resource: host,
        link: {
          id: id(8),
          projectId,
          resourceId: hostId,
          type: "supports",
          lifecycle: "active",
        },
        resourceCreated: false,
        linkCreated: true,
        identity: null,
        recordedBy: "user:owner",
        recordedAt: at,
        correlationId,
        contentDigest: "e".repeat(64),
      });
      return json({ record, replayed: false, correlationId });
    }
    if (url.pathname.endsWith("/preview")) return json(preview);
    if (url.pathname.endsWith("/" + proposalId)) return json(detail(decision));
    return json({
      schemaVersion: 1,
      projectId,
      items: url.pathname.endsWith("/onboarding") ? [proposal] : [],
      nextCursor: null,
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { posts, fetchMock };
}
async function ready() {
  fireEvent.change(screen.getByLabelText("Workflow"), {
    target: { value: "onboarding" },
  });
  fireEvent.click(await screen.findByRole("button", { name: /Inspect host/ }));
  await screen.findByText("Review host inventory changes");
}
function approve() {
  fireEvent.change(screen.getByLabelText("Review reason"), {
    target: { value: "Exact inventory reviewed." },
  });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(
    screen.getByRole("button", { name: "Approve inventory changes" }),
  );
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("owner workflow console", () => {
  it("does not fetch or grant owner controls in local preview", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<FoundationWorkflowReview enabled={false} />);
    expect(screen.getByText(/Sign in as the owner/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("recovers the exact review receipt after loss and requires a separate explicit apply", async () => {
    const f = fixture({ lost: true });
    render(<FoundationWorkflowReview enabled initialProjectId={projectId} />);
    await ready();
    expect(document.querySelector("script")).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: "Approve inventory changes",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    approve();
    const retry = await screen.findByRole("button", {
      name: "Retry same request",
    });
    await waitFor(() =>
      expect((retry as HTMLButtonElement).disabled).toBe(false),
    );
    expect(
      (screen.getByLabelText("Project") as HTMLSelectElement).disabled,
    ).toBe(true);
    expect(
      screen.queryByRole("button", {
        name: "Apply approved inventory changes",
      }),
    ).toBeNull();
    fireEvent.click(retry);
    const apply = await screen.findByRole("button", {
      name: "Apply approved inventory changes",
    });
    expect(f.posts).toHaveLength(2);
    expect(f.posts[1]!.init.body).toBe(f.posts[0]!.init.body);
    expect(f.posts[1]!.init.headers).toEqual(f.posts[0]!.init.headers);
    fireEvent.click(apply);
    await screen.findByText(/Host inventory and project connection saved/);
    expect(f.posts).toHaveLength(3);
    expect(f.posts[2]!.path).toMatch(/onboarding\/apply$/);
    expect(JSON.parse(String(f.posts[2]!.init.body))).toMatchObject({
      projectId,
      proposalId,
      decisionId: id(6),
      expectedDecisionVersion: 1,
    });
  });
  it("requires reloading after a stale decision and offers no stale apply", async () => {
    const f = fixture({ conflict: true });
    render(<FoundationWorkflowReview enabled initialProjectId={projectId} />);
    await ready();
    approve();
    await screen.findByRole("alert");
    expect(
      screen.queryByRole("button", {
        name: "Apply approved inventory changes",
      }),
    ).toBeNull();
    expect(screen.queryByLabelText("Review reason")).toBeNull();
    expect(f.posts).toHaveLength(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Reload current view" }),
    );
    await screen.findByLabelText("Review reason");
  });
  it("keeps an uncertain request when a valid-shaped receipt does not match its input", async () => {
    fixture({ corrupt: true });
    render(<FoundationWorkflowReview enabled initialProjectId={projectId} />);
    await ready();
    approve();
    await screen.findByRole("button", { name: "Retry same request" });
    expect(
      screen.queryByRole("button", {
        name: "Apply approved inventory changes",
      }),
    ).toBeNull();
    expect(screen.queryByText(/Owner decision recorded/)).toBeNull();
  });
});

describe("workflow traversal and selection freshness", () => {
  const approved = () =>
    foundationOnboardingDecisionSchema.parse({
      projectId,
      proposalId,
      expectedProposalDigest: proposal.contentDigest,
      expectedPreviewDigest: preview.previewDigest,
      expectedDecisionVersion: 0,
      decision: "approved",
      reason: "Prior owner review",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      inventoryReviewed: true,
      schemaVersion: 1,
      id: id(6),
      version: 1,
      recordedBy: "user:owner",
      recordedAt: at,
      contentDigest: "d".repeat(64),
      preconditions: preview.preconditions,
    });
  it("does not revive a cached approved selection while a new activation is loading", async () => {
    const b = { ...proposal, id: id(42), rationale: "Other host" };
    let aReads = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string) => {
        const url = new URL(path, "http://localhost");
        if (url.pathname === "/api/v1/projects")
          return json({ items: [project], nextCursor: null });
        if (url.pathname.endsWith("/improvements"))
          return json({
            schemaVersion: 1,
            projectId,
            items: [],
            nextCursor: null,
          });
        if (url.pathname.endsWith("/onboarding"))
          return json({
            schemaVersion: 1,
            projectId,
            items: [proposal, b],
            nextCursor: null,
          });
        if (url.pathname.endsWith("/preview")) return json(preview);
        if (url.pathname.endsWith("/" + proposalId) && aReads++ === 0)
          return json(detail(approved()));
        return new Promise<Response>(() => {});
      }),
    );
    render(<FoundationWorkflowReview enabled initialProjectId={projectId} />);
    await ready();
    await screen.findByRole("button", {
      name: "Apply approved inventory changes",
    });
    fireEvent.click(screen.getByRole("button", { name: /Other host/ }));
    expect(
      screen.queryByRole("button", {
        name: "Apply approved inventory changes",
      }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Inspect host/ }));
    expect(
      screen.queryByRole("button", {
        name: "Apply approved inventory changes",
      }),
    ).toBeNull();
    expect(screen.getByText("Loading exact review...")).toBeTruthy();
  });
  it("does not let an old continuation replace a refreshed traversal cursor", async () => {
    const b = { ...proposal, id: id(42), rationale: "Stale continuation item" };
    let firstPages = 0,
      resolveOld!: (value: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string) => {
        const url = new URL(path, "http://localhost");
        if (url.pathname === "/api/v1/projects")
          return json({ items: [project], nextCursor: null });
        if (url.pathname.endsWith("/improvements"))
          return json({
            schemaVersion: 1,
            projectId,
            items: [],
            nextCursor: null,
          });
        if (url.pathname.endsWith("/onboarding")) {
          if (url.searchParams.has("cursor"))
            return new Promise<Response>((resolve) => {
              resolveOld = resolve;
            });
          firstPages++;
          return json({
            schemaVersion: 1,
            projectId,
            items: [proposal],
            nextCursor: firstPages === 1 ? "old-cursor" : "fresh-cursor",
          });
        }
        if (url.pathname.endsWith("/preview")) return json(preview);
        return json(detail());
      }),
    );
    render(<FoundationWorkflowReview enabled initialProjectId={projectId} />);
    await ready();
    fireEvent.click(
      screen.getByRole("button", { name: "Load more proposals" }),
    );
    await waitFor(() => expect(resolveOld).toBeTypeOf("function"));
    fireEvent.click(
      screen.getByRole("button", { name: "Reload current view" }),
    );
    await waitFor(() => expect(firstPages).toBe(2));
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Load more proposals",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    await import("@testing-library/react").then(({ act }) =>
      act(async () => {
        resolveOld(
          json({ schemaVersion: 1, projectId, items: [b], nextCursor: null }),
        );
      }),
    );
    expect(
      screen.queryByRole("button", { name: /Stale continuation item/ }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Load more proposals" }),
    ).toBeTruthy();
  });
});
