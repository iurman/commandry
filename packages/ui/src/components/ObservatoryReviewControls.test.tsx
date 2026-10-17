// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
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
import {
  observatoryAnnotationChangeSchema,
  observatoryCatalogueResultSchema,
  observatoryProviderMappingChangeSchema,
  observatoryRelationChangeSchema,
  observatorySourceBindingChangeSchema,
  type ObservatoryCatalogueItem,
} from "@commandry/contracts";
import {
  ObservatoryReviewControls,
  type ObservatoryReviewControlsProps,
  type ObservatoryReviewKind,
} from "./ObservatoryReviewControls";

const id = (n: number) =>
  `abcdefab-0000-4000-8000-${String(n).padStart(12, "0")}`;
const hostile = "<img src=x onerror=alert(1)> literal owner";
const provenance = {
  actorId: hostile,
  recordedAt: "2026-10-16T12:30:00.000Z",
  evidenceRefs: ["evidence:<script>literal</script>"],
};
const resources = [
  {
    id: id(1),
    kind: "repository",
    name: "<script>literal repository</script>",
  },
  { id: id(2), kind: "deployment", name: "Deployment" },
  { id: id(3), kind: "host", name: "Host" },
  { id: id(4), kind: "provider", name: "Cloudflare" },
  { id: id(5), kind: "service", name: "Service" },
  { id: id(6), kind: "repository", name: "Foreign repository" },
];
function annotation(): Extract<
  ObservatoryCatalogueItem,
  { kind: "annotation" }
> {
  return {
    kind: "annotation",
    id: id(1),
    resourceId: id(1),
    version: 7,
    metadata: {
      resourceId: id(1),
      role: "operated",
      pinned: true,
      environment: "<script>literal environment</script>",
      provenance,
    },
    requirement: "required",
  };
}
function relation(reverse = false): ObservatoryCatalogueItem {
  const sourceId = reverse ? id(2) : id(1),
    targetId = reverse ? id(1) : id(2);
  return {
    kind: "relation",
    id: id(300),
    sourceId,
    targetId,
    version: 8,
    active: false,
    record: {
      id: id(300),
      type: reverse ? "depends_on" : "deploys",
      sourceId,
      targetId,
      sourceKind: reverse ? "deployment" : "repository",
      targetKind: reverse ? "repository" : "deployment",
      environment: null,
      provenance,
    },
  };
}
function provider(): ObservatoryCatalogueItem {
  return {
    kind: "provider",
    id: id(400),
    resourceId: id(1),
    providerResourceId: id(4),
    version: 9,
    active: false,
    feedId: "cloudflare",
    componentId: "Stable_Component-123",
    record: {
      id: id(400),
      resourceId: id(1),
      providerId: id(4),
      product: "Stable_Component-123",
      environment: null,
      geography: null,
      plane: "data",
      provenance,
    },
  };
}
function source(
  n = 0,
  projectId: string | null = id(201),
): ObservatoryCatalogueItem {
  return {
    kind: "source",
    id: id(600 + n),
    resourceId: id(1),
    projectId,
    environment: null,
    version: 10 + n,
    sourceKind: "github-repository",
    externalId: `owner/repository-${n}`,
    enabled: n % 2 === 0,
    freshnessSeconds: 300,
    provenance,
  };
}
function envelope(
  kind: ObservatoryReviewKind,
  items: ObservatoryCatalogueItem[],
) {
  return {
    schemaVersion: 1,
    scopeDigest: "authorized-scope",
    projectionRevision: "revision:canonical",
    completeness: "complete",
    kind,
    items,
  };
}
function committed(
  kind: ObservatoryReviewKind,
  raw: unknown,
): ObservatoryCatalogueItem {
  if (kind === "annotation") {
    const p = observatoryAnnotationChangeSchema.parse(raw);
    return {
      kind,
      id: p.resourceId,
      resourceId: p.resourceId,
      version: p.expectedVersion + 1,
      metadata: {
        resourceId: p.resourceId,
        role: p.role,
        pinned: p.pinned,
        environment: p.environment,
        provenance,
      },
      requirement: p.requirement,
    };
  }
  if (kind === "relation") {
    const p = observatoryRelationChangeSchema.parse(raw);
    return {
      kind,
      id: p.id,
      sourceId: p.relation.sourceId,
      targetId: p.relation.targetId,
      version: p.expectedVersion + 1,
      active: p.active,
      record: { ...p.relation, provenance },
    };
  }
  if (kind === "provider") {
    const p = observatoryProviderMappingChangeSchema.parse(raw);
    return {
      kind,
      id: p.id,
      resourceId: p.dependency.resourceId,
      providerResourceId: p.dependency.providerId,
      version: p.expectedVersion + 1,
      active: p.active,
      feedId: p.feedId,
      componentId: p.componentId,
      record: { ...p.dependency, provenance },
    };
  }
  const p = observatorySourceBindingChangeSchema.parse(raw);
  return {
    kind,
    id: p.id,
    resourceId: p.resourceId,
    projectId: p.projectId,
    environment: p.environment,
    version: p.expectedVersion + 1,
    sourceKind: p.kind,
    externalId: p.externalId,
    enabled: p.enabled,
    freshnessSeconds: p.freshnessSeconds,
    provenance,
  };
}
function fixture(
  initial: Partial<
    Record<ObservatoryReviewKind, ObservatoryCatalogueItem[]>
  > = {},
) {
  const rows: Record<ObservatoryReviewKind, ObservatoryCatalogueItem[]> = {
    annotation: [annotation()],
    relation: [relation()],
    provider: [provider()],
    source: [source()],
    ...initial,
  };
  const loadCatalogue = vi.fn(
    async (
      kind: ObservatoryReviewKind,
      _resourceId: string,
    ): Promise<unknown> =>
      observatoryCatalogueResultSchema.parse(envelope(kind, rows[kind])),
  );
  const review = vi.fn(
    async (kind: ObservatoryReviewKind, input: unknown): Promise<unknown> => {
      const item = committed(kind, input);
      rows[kind] = [
        ...rows[kind].filter((old) => old.id !== item.id),
        item,
      ].sort((a, b) => a.id.localeCompare(b.id));
      return { id: item.id, version: item.version, auditId: id(900) };
    },
  );
  const props: ObservatoryReviewControlsProps = {
    resource: resources[0]!,
    resources,
    projectIds: [id(202), id(201)],
    scopeKey: "owner:global",
    selectedProjectId: null,
    loadCatalogue,
    review,
    onReviewed: vi.fn(),
  };
  return { rows, loadCatalogue, review, props };
}
const field = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
function evidence() {
  field("Evidence references (one per line)", "review:one\nreview:two");
  field("Review note", "Owner verified exact endpoints and scope.");
}
async function tab(name: string) {
  fireEvent.click(screen.getByRole("tab", { name }));
  await waitFor(() =>
    expect(
      screen.queryByText("Loading reviewed configuration..."),
    ).not.toBeInTheDocument(),
  );
}
async function edit(recordId: string) {
  fireEvent.click(
    await screen.findByRole("button", { name: `Edit ${recordId}` }),
  );
}
function submit() {
  fireEvent.submit(screen.getByRole("form", { name: "Review configuration" }));
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("owner reviewed configuration", () => {
  it("makes all 137 active/inactive versioned records searchable, with literal provenance and evidence", async () => {
    const f = fixture({
      source: Array.from({ length: 137 }, (_, i) => source(i)),
    });
    const { container } = render(<ObservatoryReviewControls {...f.props} />);
    expect(screen.getByText("Reviewed configuration")).toBeInTheDocument();
    await tab("Sources");
    expect(screen.getAllByRole("button", { name: /^Edit / })).toHaveLength(137);
    expect(
      screen.getByText("137 reviewed records, including inactive records."),
    ).toBeInTheDocument();
    field("Search reviewed configuration", "repository-136");
    expect(screen.getAllByRole("button", { name: /^Edit / })).toHaveLength(1);
    expect(
      screen.getByText(`Record ${id(736)}. Version 146.`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`Recorded by ${hostile} at ${provenance.recordedAt}`),
    ).toBeInTheDocument();
    expect(screen.getByText(provenance.evidenceRefs[0]!)).toBeInTheDocument();
    expect(container.querySelector("script,img")).toBeNull();
    await edit(id(736));
    expect(
      screen.getByText(`Record ${id(736)}. Expected version 146.`),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Enabled")).toBeChecked();
    expect(screen.getByLabelText("Review note")).toHaveValue("");
    field("Search reviewed configuration", "repository-135");
    await edit(id(735));
    expect(screen.getByLabelText("Enabled")).not.toBeChecked();
  });

  it.each(["annotation", "relation", "provider", "source"] as const)(
    "submits a complete strict %s change with its actual expected version, then reloads canonical records",
    async (kind) => {
      const f = fixture();
      render(<ObservatoryReviewControls {...f.props} />);
      const labels = {
        annotation: "Annotations",
        relation: "Relationships",
        provider: "Provider dependencies",
        source: "Sources",
      };
      await tab(labels[kind]);
      const item = f.rows[kind][0]!;
      await edit(item.id);
      evidence();
      if (kind === "annotation") {
        field("Operational role", "unknown");
        field("Requirement", "optional");
        fireEvent.click(screen.getByLabelText("Pinned"));
        expect(screen.getByText(/does not imply healthy/)).toBeInTheDocument();
      }
      if (kind === "relation" || kind === "provider")
        fireEvent.click(screen.getByLabelText("Active"));
      if (kind === "source") fireEvent.click(screen.getByLabelText("Enabled"));
      field("Environment (optional)", "staging");
      submit();
      await waitFor(() => expect(f.props.onReviewed).toHaveBeenCalledOnce());
      expect(f.review).toHaveBeenCalledOnce();
      const [called, input] = f.review.mock.calls[0]!;
      expect(called).toBe(kind);
      const schemas = {
        annotation: observatoryAnnotationChangeSchema,
        relation: observatoryRelationChangeSchema,
        provider: observatoryProviderMappingChangeSchema,
        source: observatorySourceBindingChangeSchema,
      };
      expect(schemas[kind].parse(input)).toEqual(input);
      expect(input).toMatchObject({
        expectedVersion: item.version,
        review: {
          evidenceRefs: ["review:one", "review:two"],
          note: "Owner verified exact endpoints and scope.",
        },
      });
      expect(JSON.stringify(input)).not.toMatch(
        /principalId|ownerId|permission|credential|auditId/,
      );
      expect(
        f.loadCatalogue.mock.calls.filter(([value]) => value === kind),
      ).toHaveLength(2);
      expect(
        screen.getByText(`Record ${item.id}. Version ${item.version + 1}.`),
      ).toBeInTheDocument();
      if (kind === "provider")
        expect(input).toMatchObject({
          dependency: {
            providerId: id(4),
            product: "Stable_Component-123",
            geography: null,
            plane: "data",
          },
          componentId: "Stable_Component-123",
          feedId: "cloudflare",
        });
      if (kind === "relation")
        expect(input).toMatchObject({
          relation: {
            sourceId: id(1),
            targetId: id(2),
            sourceKind: "repository",
            targetKind: "deployment",
            type: "deploys",
          },
        });
    },
  );

  it("edits an incoming relation without reversing its endpoints", async () => {
    const f = fixture({ relation: [relation(true)] });
    render(<ObservatoryReviewControls {...f.props} />);
    await tab("Relationships");
    await edit(id(300));
    expect(screen.getByLabelText("Source resource")).toHaveValue(id(2));
    expect(screen.getByLabelText("Target resource")).toHaveValue(id(1));
    evidence();
    submit();
    await waitFor(() => expect(f.review).toHaveBeenCalledOnce());
    expect(f.review.mock.calls[0]![1]).toMatchObject({
      expectedVersion: 8,
      active: false,
      relation: {
        sourceId: id(2),
        targetId: id(1),
        sourceKind: "deployment",
        targetKind: "repository",
        type: "depends_on",
      },
    });
  });

  it("requires an explicit provider, stable component and plane, and leaves empty geography null", async () => {
    const f = fixture({ provider: [] });
    render(<ObservatoryReviewControls {...f.props} />);
    await tab("Provider dependencies");
    fireEvent.click(
      screen.getByRole("button", { name: "Create provider dependency" }),
    );
    expect(screen.getByLabelText("Plane")).toHaveValue("");
    const providerSelect = screen.getByLabelText("Provider");
    expect(within(providerSelect).getAllByRole("option")).toHaveLength(2);
    expect(within(providerSelect).queryByText(/Deployment/)).toBeNull();
    field("Provider", id(4));
    field("Stable Cloudflare component ID", "Reviewed_Stable-ID");
    evidence();
    submit();
    expect(f.review).not.toHaveBeenCalled();
    field("Plane", "control");
    submit();
    await waitFor(() => expect(f.props.onReviewed).toHaveBeenCalledOnce());
    expect(f.review.mock.calls[0]![1]).toMatchObject({
      expectedVersion: 0,
      active: true,
      componentId: "Reviewed_Stable-ID",
      dependency: {
        product: "Reviewed_Stable-ID",
        providerId: id(4),
        geography: null,
        environment: null,
        plane: "control",
      },
    });
  });

  it("creates source drafts disabled and requires a global owner to choose a project from the complete catalogue", async () => {
    const f = fixture({ source: [] });
    render(<ObservatoryReviewControls {...f.props} />);
    await tab("Sources");
    fireEvent.click(screen.getByRole("button", { name: "Create source" }));
    expect(screen.getByLabelText("Project")).toHaveValue("");
    expect(screen.getByLabelText("Enabled")).not.toBeChecked();
    expect(
      within(screen.getByLabelText("Project")).getAllByRole("option"),
    ).toHaveLength(3);
    field("Reviewed external ID", "reviewed_monitor-1");
    evidence();
    submit();
    expect(f.review).not.toHaveBeenCalled();
    field("Project", id(201));
    submit();
    await waitFor(() => expect(f.props.onReviewed).toHaveBeenCalledOnce());
    expect(f.review.mock.calls[0]![1]).toMatchObject({
      expectedVersion: 0,
      resourceId: id(1),
      projectId: id(201),
      kind: "infraagent-monitor",
      externalId: "reviewed_monitor-1",
      enabled: false,
      environment: null,
      freshnessSeconds: 300,
    });
    expect(
      screen.queryByLabelText(/credential|origin/i),
    ).not.toBeInTheDocument();
  });

  it("prefills selected project for a new source but requires explicit review of a legacy unbound source", async () => {
    const f = fixture({ source: [source(0, null)] });
    f.props.selectedProjectId = id(201);
    render(<ObservatoryReviewControls {...f.props} />);
    await tab("Sources");
    await edit(id(600));
    expect(screen.getByLabelText("Project")).toHaveValue("");
    evidence();
    submit();
    expect(f.review).not.toHaveBeenCalled();
    field("Project", id(201));
    submit();
    await waitFor(() => expect(f.props.onReviewed).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Create source" }));
    expect(screen.getByLabelText("Project")).toHaveValue(id(201));
    expect(
      within(screen.getByLabelText("Project")).getAllByRole("option"),
    ).toHaveLength(2);
  });

  it.each([
    "https://monitor.example/status",
    "../repo",
    "owner/..",
    "owner/repo?token=secret",
  ])(
    "rejects invalid reviewed GitHub identity %s before the client",
    async (externalId) => {
      const f = fixture();
      render(<ObservatoryReviewControls {...f.props} />);
      await tab("Sources");
      await edit(id(600));
      evidence();
      field("Reviewed external ID", externalId);
      submit();
      expect(f.review).not.toHaveBeenCalled();
      expect(screen.getByRole("alert")).toHaveTextContent("required fields");
      expect(screen.getByLabelText("Reviewed external ID")).toHaveValue(
        externalId,
      );
    },
  );

  it.each(["29", "86401", "30.5", ""])(
    "rejects invalid source freshness %s before the client",
    async (value) => {
      const f = fixture();
      render(<ObservatoryReviewControls {...f.props} />);
      await tab("Sources");
      await edit(id(600));
      evidence();
      field("Freshness seconds (30 to 86400)", value);
      submit();
      expect(f.review).not.toHaveBeenCalled();
    },
  );

  it("rejects invalid typed, equal or unrelated relation endpoints and missing evidence/note before the client", async () => {
    const f = fixture();
    render(<ObservatoryReviewControls {...f.props} />);
    await tab("Relationships");
    await edit(id(300));
    submit();
    expect(f.review).not.toHaveBeenCalled();
    evidence();
    field("Target resource", id(3));
    submit();
    expect(f.review).not.toHaveBeenCalled();
    field("Relationship type", "depends_on");
    field("Target resource", id(1));
    submit();
    expect(f.review).not.toHaveBeenCalled();
    field("Source resource", id(2));
    field("Target resource", id(3));
    submit();
    expect(f.review).not.toHaveBeenCalled();
    field("Source resource", id(1));
    field("Evidence references (one per line)", "   ");
    submit();
    expect(f.review).not.toHaveBeenCalled();
    field("Evidence references (one per line)", "review:valid\n ");
    submit();
    expect(f.review).not.toHaveBeenCalled();
    field("Evidence references (one per line)", "review:valid");
    field("Review note", " ");
    submit();
    expect(f.review).not.toHaveBeenCalled();
  });

  it("retains the versioned draft and its generated UUID across a version conflict and retry", async () => {
    const f = fixture({ source: [] });
    const normal = f.review.getMockImplementation()!;
    f.review
      .mockRejectedValueOnce(new Error("VERSION_CONFLICT"))
      .mockImplementation(normal);
    render(<ObservatoryReviewControls {...f.props} />);
    await tab("Sources");
    fireEvent.click(screen.getByRole("button", { name: "Create source" }));
    field("Project", id(201));
    field("Reviewed external ID", "reviewed-monitor");
    evidence();
    submit();
    await screen.findByRole("alert");
    expect(screen.getByRole("alert")).toHaveTextContent("draft is retained");
    expect(screen.getByRole("alert")).toHaveTextContent("Reload and review");
    expect(f.props.onReviewed).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Reviewed external ID")).toHaveValue(
      "reviewed-monitor",
    );
    submit();
    await waitFor(() => expect(f.props.onReviewed).toHaveBeenCalledOnce());
    expect(f.review.mock.calls[1]![1]).toEqual(f.review.mock.calls[0]![1]);
    const payload = observatorySourceBindingChangeSchema.parse(
      f.review.mock.calls[0]![1],
    );
    expect(payload.expectedVersion).toBe(0);
    expect(payload.id).toMatch(/^[a-f0-9-]{36}$/);
  });

  it.each([
    { id: id(1), version: 8, auditId: id(900), raw: "forbidden" },
    { id: id(1), version: 8 },
    { id: id(6), version: 8, auditId: id(900) },
    { id: id(1), version: 7, auditId: id(900) },
    { id: id(1), version: 0, auditId: id(900) },
    { id: id(1), version: 8, auditId: "not-an-audit" },
  ])(
    "rejects malformed or unrelated receipts without inventing a version",
    async (result) => {
      const f = fixture();
      f.review.mockResolvedValue(result);
      render(<ObservatoryReviewControls {...f.props} />);
      await edit(id(1));
      evidence();
      submit();
      await screen.findByRole("alert");
      expect(f.props.onReviewed).not.toHaveBeenCalled();
      expect(
        screen.getByText(`Record ${id(1)}. Expected version 7.`),
      ).toBeInTheDocument();
      expect(
        screen.getByText(`Record ${id(1)}. Version 7.`),
      ).toBeInTheDocument();
      expect(f.loadCatalogue).toHaveBeenCalledOnce();
    },
  );

  it("requires the accepted record/version in the fresh catalogue and retains the draft if reload fails", async () => {
    const f = fixture();
    f.review.mockResolvedValue({ id: id(1), version: 8, auditId: id(900) });
    render(<ObservatoryReviewControls {...f.props} />);
    await edit(id(1));
    evidence();
    submit();
    await screen.findByRole("alert");
    expect(screen.getByRole("alert")).toHaveTextContent("Review accepted");
    expect(f.props.onReviewed).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Review note")).toHaveValue(
      "Owner verified exact endpoints and scope.",
    );
    expect(
      screen.getByRole("button", { name: "Submit review" }),
    ).toBeDisabled();
  });

  it.each([
    "missing",
    "incomplete",
    "wrong-kind",
    "cross-resource",
    "cross-endpoint",
    "cross-provider",
    "cross-project",
  ])(
    "keeps %s catalogue unavailable and cannot enable create/save",
    async (mode) => {
      const f = fixture();
      const kind: ObservatoryReviewKind =
        mode === "cross-endpoint"
          ? "relation"
          : mode === "cross-provider"
            ? "provider"
            : mode === "cross-project"
              ? "source"
              : "annotation";
      let raw: unknown = envelope(kind, f.rows[kind]);
      if (mode === "missing") raw = undefined;
      if (mode === "incomplete")
        raw = { ...envelope(kind, []), completeness: "partial" };
      if (mode === "wrong-kind") raw = envelope("source", []);
      if (mode === "cross-resource")
        raw = envelope("annotation", [
          {
            ...annotation(),
            id: id(6),
            resourceId: id(6),
            metadata: {
              ...(
                annotation() as Extract<
                  ObservatoryCatalogueItem,
                  { kind: "annotation" }
                >
              ).metadata,
              resourceId: id(6),
            },
          },
        ]);
      if (mode === "cross-endpoint") {
        const row = relation() as Extract<
          ObservatoryCatalogueItem,
          { kind: "relation" }
        >;
        raw = envelope("relation", [
          {
            ...row,
            targetId: id(99),
            record: { ...row.record, targetId: id(99) },
          },
        ]);
      }
      if (mode === "cross-provider") {
        const row = provider() as Extract<
          ObservatoryCatalogueItem,
          { kind: "provider" }
        >;
        raw = envelope("provider", [
          {
            ...row,
            providerResourceId: id(3),
            record: { ...row.record, providerId: id(3) },
          },
        ]);
      }
      if (mode === "cross-project") {
        f.props.selectedProjectId = id(201);
        raw = envelope("source", [source(0, id(202))]);
      }
      f.loadCatalogue.mockImplementation(async (requested) =>
        requested === kind ? raw : envelope(requested, []),
      );
      render(<ObservatoryReviewControls {...f.props} />);
      if (kind !== "annotation")
        await tab(
          kind === "relation"
            ? "Relationships"
            : kind === "provider"
              ? "Provider dependencies"
              : "Sources",
        );
      await screen.findByRole("alert");
      expect(screen.queryByRole("button", { name: /^Create / })).toBeNull();
      expect(screen.queryByRole("button", { name: /^Edit / })).toBeNull();
      expect(
        screen.queryByText("No reviewed configuration for this kind."),
      ).toBeNull();
      expect(f.review).not.toHaveBeenCalled();
    },
  );

  it("allows creation from a strict complete empty annotation catalogue", async () => {
    const f = fixture({ annotation: [] });
    render(<ObservatoryReviewControls {...f.props} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Create annotation" }),
    );
    evidence();
    submit();
    await waitFor(() => expect(f.props.onReviewed).toHaveBeenCalledOnce());
    expect(f.review.mock.calls[0]![1]).toMatchObject({
      expectedVersion: 0,
      resourceId: id(1),
      role: "unknown",
      pinned: false,
      environment: null,
      requirement: "unspecified",
    });
  });

  it.each(["scope", "resource", "kind", "load-client", "review-client"])(
    "cancels late reads immediately when %s changes",
    async (mode) => {
      const f = fixture();
      const pending = deferred<unknown>();
      f.loadCatalogue.mockImplementationOnce(() => pending.promise);
      const rendered = render(<ObservatoryReviewControls {...f.props} />);
      await waitFor(() => expect(f.loadCatalogue).toHaveBeenCalledOnce());
      const next = { ...f.props };
      if (mode === "scope" || mode === "review-client")
        f.rows.annotation = [{ ...annotation(), version: 42 }];
      if (mode === "scope") next.scopeKey = "owner:new-scope";
      if (mode === "resource") next.resource = resources[5]!;
      if (mode === "load-client")
        next.loadCatalogue = vi.fn(async () => envelope("annotation", []));
      if (mode === "review-client") next.review = vi.fn(async () => undefined);
      if (mode === "kind") await tab("Sources");
      else rendered.rerender(<ObservatoryReviewControls {...next} />);
      await act(async () =>
        pending.resolve(envelope("annotation", [annotation()])),
      );
      if (mode === "review-client" || mode === "scope")
        await waitFor(() => expect(f.loadCatalogue).toHaveBeenCalledTimes(2));
      if (mode === "scope" || mode === "review-client")
        expect(
          screen.getByText(`Record ${id(1)}. Version 42.`),
        ).toBeInTheDocument();
      else expect(screen.queryByText(`Record ${id(1)}. Version 7.`)).toBeNull();
      expect(screen.queryByText(`Record ${id(1)}. Version 7.`)).toBeNull();
      if (mode === "kind")
        expect(screen.getByRole("tab", { name: "Sources" })).toHaveAttribute(
          "aria-selected",
          "true",
        );
      expect(f.props.onReviewed).not.toHaveBeenCalled();
    },
  );

  it("does not flash already-loaded records while a changed scope is loading", async () => {
    const f = fixture();
    const rendered = render(<ObservatoryReviewControls {...f.props} />);
    await screen.findByRole("button", { name: `Edit ${id(1)}` });
    const pending = deferred<unknown>();
    const load = vi.fn(() => pending.promise);
    rendered.rerender(
      <ObservatoryReviewControls
        {...f.props}
        scopeKey="new"
        loadCatalogue={load}
      />,
    );
    expect(screen.queryByRole("button", { name: `Edit ${id(1)}` })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Create / })).toBeNull();
    await act(async () => pending.resolve(envelope("annotation", [])));
    await screen.findByRole("button", { name: "Create annotation" });
  });

  it("reaches every project in a complete 137-project catalogue without choosing one for the global owner", async () => {
    const f = fixture({ source: [] });
    f.props.projectIds = Array.from({ length: 137 }, (_, index) =>
      id(1000 + index),
    );
    render(<ObservatoryReviewControls {...f.props} />);
    await tab("Sources");
    fireEvent.click(screen.getByRole("button", { name: "Create source" }));
    expect(
      within(screen.getByLabelText("Project")).getAllByRole("option"),
    ).toHaveLength(138);
    expect(screen.getByLabelText("Project")).toHaveValue("");
    field("Project", id(1136));
    field("Reviewed external ID", "last-project-monitor");
    evidence();
    submit();
    await waitFor(() => expect(f.props.onReviewed).toHaveBeenCalledOnce());
    expect(f.review.mock.calls[0]![1]).toMatchObject({ projectId: id(1136) });
  });

  it("rejects arbitrary monitoring origins for an InfraAgent binding", async () => {
    const f = fixture({ source: [] });
    render(<ObservatoryReviewControls {...f.props} />);
    await tab("Sources");
    fireEvent.click(screen.getByRole("button", { name: "Create source" }));
    field("Project", id(201));
    field(
      "Reviewed external ID",
      "https://monitor.example/status?credential=secret",
    );
    evidence();
    submit();
    expect(f.review).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).not.toHaveTextContent("secret");
  });

  it.each(["daylight", "midnight"])(
    "supports keyboard review controls in the %s theme",
    async (theme) => {
      const f = fixture();
      render(
        <div data-theme={theme}>
          <ObservatoryReviewControls {...f.props} />
        </div>,
      );
      const annotations = screen.getByRole("tab", { name: "Annotations" });
      annotations.focus();
      fireEvent.keyDown(annotations, { key: "ArrowRight" });
      await screen.findByRole("button", { name: `Edit ${id(300)}` });
      expect(screen.getByRole("tab", { name: "Relationships" })).toHaveFocus();
      expect(
        screen.getByRole("tabpanel", { name: "Relationships" }),
      ).toBeInTheDocument();
      fireEvent.keyDown(screen.getByRole("tab", { name: "Relationships" }), {
        key: "End",
      });
      await screen.findByRole("button", { name: `Edit ${id(600)}` });
      expect(screen.getByRole("tab", { name: "Sources" })).toHaveFocus();
      fireEvent.keyDown(screen.getByRole("tab", { name: "Sources" }), {
        key: "Home",
      });
      await edit(id(1));
      expect(screen.getByLabelText("Review note")).toBeEnabled();
    },
  );

  it("preserves the draft and notifies only the current callback after a callback-only rerender before submit", async () => {
    const f = fixture();
    const rendered = render(<ObservatoryReviewControls {...f.props} />);
    await edit(id(1));
    evidence();
    field("Environment (optional)", "reviewed-environment");
    const onReviewed = vi.fn();
    rendered.rerender(
      <ObservatoryReviewControls {...f.props} onReviewed={onReviewed} />,
    );
    expect(screen.getByLabelText("Review note")).toHaveValue(
      "Owner verified exact endpoints and scope.",
    );
    expect(
      screen.getByLabelText("Evidence references (one per line)"),
    ).toHaveValue("review:one\nreview:two");
    expect(screen.getByLabelText("Environment (optional)")).toHaveValue(
      "reviewed-environment",
    );
    expect(
      screen.getByText(`Record ${id(1)}. Expected version 7.`),
    ).toBeInTheDocument();
    expect(f.loadCatalogue).toHaveBeenCalledOnce();
    submit();
    await waitFor(() => expect(onReviewed).toHaveBeenCalledOnce());
    expect(f.props.onReviewed).not.toHaveBeenCalled();
    expect(f.review).toHaveBeenCalledOnce();
    expect(f.review.mock.calls[0]![1]).toMatchObject({
      expectedVersion: 7,
      environment: "reviewed-environment",
    });
    expect(f.loadCatalogue).toHaveBeenCalledTimes(2);
  });

  it("uses only the current callback after a callback-only rerender during accepted reload", async () => {
    const f = fixture();
    const pending = deferred<unknown>();
    f.loadCatalogue
      .mockImplementationOnce(async () =>
        envelope("annotation", f.rows.annotation),
      )
      .mockImplementationOnce(() => pending.promise);
    const rendered = render(<ObservatoryReviewControls {...f.props} />);
    await edit(id(1));
    evidence();
    submit();
    await waitFor(() => expect(f.loadCatalogue).toHaveBeenCalledTimes(2));
    const replaced = vi.fn(),
      onReviewed = vi.fn();
    rendered.rerender(
      <ObservatoryReviewControls {...f.props} onReviewed={replaced} />,
    );
    rendered.rerender(
      <ObservatoryReviewControls {...f.props} onReviewed={onReviewed} />,
    );
    expect(screen.getByLabelText("Review note")).toHaveValue(
      "Owner verified exact endpoints and scope.",
    );
    expect(
      screen.getByRole("button", { name: "Submitting review..." }),
    ).toBeDisabled();
    expect(f.loadCatalogue).toHaveBeenCalledTimes(2);
    expect(f.props.onReviewed).not.toHaveBeenCalled();
    expect(replaced).not.toHaveBeenCalled();
    expect(onReviewed).not.toHaveBeenCalled();
    await act(async () =>
      pending.resolve(envelope("annotation", f.rows.annotation)),
    );
    await waitFor(() => expect(onReviewed).toHaveBeenCalledOnce());
    expect(replaced).not.toHaveBeenCalled();
    expect(f.props.onReviewed).not.toHaveBeenCalled();
    expect(f.review).toHaveBeenCalledOnce();
    expect(f.loadCatalogue).toHaveBeenCalledTimes(2);
    expect(screen.getByText(`Record ${id(1)}. Version 8.`)).toBeInTheDocument();
  });

  it("does not notify a new scope when the accepted save's catalogue reload resolves late", async () => {
    const f = fixture();
    const pending = deferred<unknown>();
    f.loadCatalogue
      .mockImplementationOnce(async () =>
        envelope("annotation", f.rows.annotation),
      )
      .mockImplementationOnce(() => pending.promise);
    const rendered = render(<ObservatoryReviewControls {...f.props} />);
    await edit(id(1));
    evidence();
    submit();
    await waitFor(() => expect(f.loadCatalogue).toHaveBeenCalledTimes(2));
    const next = {
      ...f.props,
      scopeKey: "owner:after-acceptance",
      loadCatalogue: vi.fn(async () => envelope("annotation", [])),
      onReviewed: vi.fn(),
    };
    rendered.rerender(<ObservatoryReviewControls {...next} />);
    await screen.findByRole("button", { name: "Create annotation" });
    await act(async () =>
      pending.resolve(envelope("annotation", f.rows.annotation)),
    );
    expect(f.props.onReviewed).not.toHaveBeenCalled();
    expect(next.onReviewed).not.toHaveBeenCalled();
    expect(screen.queryByText(`Record ${id(1)}. Version 8.`)).toBeNull();
  });

  it.each([
    "scope",
    "resource",
    "kind",
    "load-client",
    "review-client",
    "unmount",
  ])(
    "a pending save cannot reload or notify after %s changes",
    async (mode) => {
      const f = fixture();
      const pending = deferred<unknown>();
      f.review.mockImplementation(() => pending.promise);
      const rendered = render(<ObservatoryReviewControls {...f.props} />);
      await edit(id(1));
      evidence();
      submit();
      await waitFor(() => expect(f.review).toHaveBeenCalledOnce());
      const next = { ...f.props, onReviewed: vi.fn() };
      if (mode === "scope") next.scopeKey = "owner:changed";
      if (mode === "resource") next.resource = resources[5]!;
      if (mode === "load-client")
        next.loadCatalogue = vi.fn(async () => envelope("annotation", []));
      if (mode === "review-client") next.review = vi.fn(async () => undefined);
      if (mode === "kind") await tab("Sources");
      else if (mode === "unmount") rendered.unmount();
      else rendered.rerender(<ObservatoryReviewControls {...next} />);
      await act(async () =>
        pending.resolve({ id: id(1), version: 8, auditId: id(900) }),
      );
      expect(f.props.onReviewed).not.toHaveBeenCalled();
      expect(next.onReviewed).not.toHaveBeenCalled();
      expect(
        f.loadCatalogue.mock.calls.filter(([kind]) => kind === "annotation"),
      ).toHaveLength(
        ["scope", "resource", "review-client"].includes(mode) ? 2 : 1,
      );
    },
  );
});
