"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  observatoryAnnotationChangeSchema,
  observatoryCatalogueResultSchema,
  observatoryProviderMappingChangeSchema,
  observatoryRelationChangeSchema,
  observatorySourceBindingChangeSchema,
  type ObservatoryCatalogueItem,
  type ObservatoryCatalogueResult,
} from "@commandry/contracts";
import "./observatory-review-controls.css";

/** Kinds edited by this form; logos have their own preview-based review. */
export type ObservatoryReviewKind = Exclude<
  ObservatoryCatalogueResult["kind"],
  "logo"
>;
export type ObservatoryReviewResource = {
  id: string;
  name: string;
  kind: string;
};
export type ObservatoryReviewReceipt = {
  id: string;
  version: number;
  auditId: string;
};
export type ObservatoryReviewClient = {
  loadCatalogue(
    kind: ObservatoryReviewKind,
    resourceId: string,
  ): Promise<unknown>;
  review(kind: ObservatoryReviewKind, input: unknown): Promise<unknown>;
};
export type ObservatoryReviewControlsProps = ObservatoryReviewClient & {
  resource: ObservatoryReviewResource;
  resources: readonly ObservatoryReviewResource[];
  projectIds: readonly string[];
  scopeKey: string;
  selectedProjectId: string | null;
  onReviewed: () => void;
};
const kinds: [ObservatoryReviewKind, string][] = [
  ["annotation", "Annotations"],
  ["relation", "Relationships"],
  ["provider", "Provider dependencies"],
  ["source", "Sources"],
];
type Draft = {
  id: string;
  expectedVersion: number;
  role: string;
  pinned: boolean;
  environment: string;
  requirement: string;
  sourceId: string;
  targetId: string;
  relationType: string;
  providerId: string;
  componentId: string;
  geography: string;
  plane: string;
  projectId: string;
  sourceKind: string;
  externalId: string;
  enabled: boolean;
  active: boolean;
  freshnessSeconds: string;
  evidence: string;
  note: string;
};
const nullable = (value: string) => (value.trim() ? value : null);
function draftFor(
  props: ObservatoryReviewControlsProps,
  kind: ObservatoryReviewKind,
  item?: ObservatoryCatalogueItem,
): Draft {
  const draft: Draft = {
    id:
      item?.id ??
      (kind === "annotation" ? props.resource.id : crypto.randomUUID()),
    expectedVersion: item?.version ?? 0,
    role: "unknown",
    pinned: false,
    environment: "",
    requirement: "unspecified",
    sourceId: props.resource.id,
    targetId: "",
    relationType: "",
    providerId: "",
    componentId: "",
    geography: "",
    plane: "",
    projectId:
      props.selectedProjectId !== null &&
      props.projectIds.includes(props.selectedProjectId)
        ? props.selectedProjectId
        : "",
    sourceKind: "",
    externalId: "",
    enabled: false,
    active: true,
    freshnessSeconds: "300",
    evidence: "",
    note: "",
  };
  if (item?.kind === "annotation")
    Object.assign(draft, {
      role: item.metadata.role,
      pinned: item.metadata.pinned,
      environment: item.metadata.environment ?? "",
      requirement: item.requirement,
    });
  if (item?.kind === "relation")
    Object.assign(draft, {
      sourceId: item.sourceId,
      targetId: item.targetId,
      relationType: item.record.type,
      environment: item.record.environment ?? "",
      active: item.active,
    });
  if (item?.kind === "provider")
    Object.assign(draft, {
      providerId: item.providerResourceId,
      componentId: item.componentId,
      environment: item.record.environment ?? "",
      geography: item.record.geography ?? "",
      plane: item.record.plane,
      active: item.active,
    });
  if (item?.kind === "source")
    Object.assign(draft, {
      projectId: item.projectId ?? "",
      environment: item.environment ?? "",
      sourceKind: item.sourceKind,
      externalId: item.externalId,
      enabled: item.enabled,
      freshnessSeconds: String(item.freshnessSeconds),
    });
  return draft;
}
function endpointsAllowed(type: string, source: string, target: string) {
  return (
    type === "depends_on" ||
    (type === "deploys" &&
      source === "repository" &&
      target === "deployment") ||
    (type === "executes_on" &&
      source === "deployment" &&
      ["host", "provider"].includes(target)) ||
    (type === "provides_service" &&
      source === "deployment" &&
      target === "service")
  );
}
function catalogue(
  raw: unknown,
  props: ObservatoryReviewControlsProps,
  kind: ObservatoryReviewKind,
): ObservatoryCatalogueItem[] {
  const result = observatoryCatalogueResultSchema.parse(raw);
  const resources = new Map(props.resources.map((row) => [row.id, row]));
  const selected = resources.get(props.resource.id);
  if (
    result.kind !== kind ||
    resources.size !== props.resources.length ||
    selected?.kind !== props.resource.kind ||
    (props.selectedProjectId !== null &&
      !props.projectIds.includes(props.selectedProjectId))
  )
    throw new Error("Invalid catalogue scope");
  for (const item of result.items) {
    if (item.kind === "relation") {
      if (
        ![item.sourceId, item.targetId].includes(props.resource.id) ||
        item.sourceId === item.targetId ||
        resources.get(item.sourceId)?.kind !== item.record.sourceKind ||
        resources.get(item.targetId)?.kind !== item.record.targetKind
      )
        throw new Error("Invalid relation endpoints");
    } else if (item.resourceId !== props.resource.id)
      throw new Error("Invalid resource scope");
    if (
      item.kind === "provider" &&
      resources.get(item.providerResourceId)?.kind !== "provider"
    )
      throw new Error("Invalid provider scope");
    if (
      item.kind === "source" &&
      item.projectId !== null &&
      (!props.projectIds.includes(item.projectId) ||
        (props.selectedProjectId !== null &&
          item.projectId !== props.selectedProjectId))
    )
      throw new Error("Invalid source project scope");
  }
  return result.items;
}
function change(
  draft: Draft,
  kind: ObservatoryReviewKind,
  props: ObservatoryReviewControlsProps,
) {
  const review = {
    evidenceRefs: draft.evidence.split(/\r?\n/),
    note: draft.note,
  };
  const common = { expectedVersion: draft.expectedVersion, review };
  const environment = nullable(draft.environment);
  if (kind === "annotation")
    return observatoryAnnotationChangeSchema.parse({
      ...common,
      resourceId: props.resource.id,
      role: draft.role,
      pinned: draft.pinned,
      environment,
      requirement: draft.requirement,
    });
  if (kind === "relation") {
    const source = props.resources.find((row) => row.id === draft.sourceId),
      target = props.resources.find((row) => row.id === draft.targetId);
    if (
      !source ||
      !target ||
      source.id === target.id ||
      ![source.id, target.id].includes(props.resource.id) ||
      !endpointsAllowed(draft.relationType, source.kind, target.kind)
    )
      throw new Error("Choose valid typed endpoints for this resource");
    return observatoryRelationChangeSchema.parse({
      ...common,
      id: draft.id,
      relation: {
        id: draft.id,
        type: draft.relationType,
        sourceId: source.id,
        targetId: target.id,
        sourceKind: source.kind,
        targetKind: target.kind,
        environment,
      },
      active: draft.active,
    });
  }
  if (kind === "provider") {
    if (
      props.resources.find((row) => row.id === draft.providerId)?.kind !==
        "provider" ||
      draft.componentId.trim() !== draft.componentId
    )
      throw new Error("Choose a provider and its exact stable component ID");
    return observatoryProviderMappingChangeSchema.parse({
      ...common,
      id: draft.id,
      dependency: {
        id: draft.id,
        resourceId: props.resource.id,
        providerId: draft.providerId,
        product: draft.componentId,
        environment,
        geography: nullable(draft.geography),
        plane: draft.plane,
      },
      feedId: "cloudflare",
      componentId: draft.componentId,
      active: draft.active,
    });
  }
  if (
    !props.projectIds.includes(draft.projectId) ||
    (props.selectedProjectId !== null &&
      props.selectedProjectId !== draft.projectId)
  )
    throw new Error("Choose a canonical project in this scope");
  return observatorySourceBindingChangeSchema.parse({
    ...common,
    id: draft.id,
    resourceId: props.resource.id,
    projectId: draft.projectId,
    environment,
    kind: draft.sourceKind,
    externalId: draft.externalId,
    enabled: draft.enabled,
    freshnessSeconds: Number(draft.freshnessSeconds),
  });
}
function receipt(raw: unknown, draft: Draft): ObservatoryReviewReceipt {
  if (
    raw === null ||
    typeof raw !== "object" ||
    Object.keys(raw).sort().join(",") !== "auditId,id,version" ||
    Object.values(Object.getOwnPropertyDescriptors(raw)).some(
      (descriptor) => !Object.hasOwn(descriptor, "value"),
    )
  )
    throw new Error("Invalid review receipt");
  const value = raw as ObservatoryReviewReceipt;
  const id = observatoryAnnotationChangeSchema.shape.resourceId.parse(value.id);
  const auditId = observatoryAnnotationChangeSchema.shape.resourceId.parse(
    value.auditId,
  );
  if (
    id !== draft.id.toLowerCase() ||
    !Number.isSafeInteger(value.version) ||
    value.version <= draft.expectedVersion
  )
    throw new Error("Invalid accepted record or version");
  return { id, version: value.version, auditId };
}
const provenance = (item: ObservatoryCatalogueItem) =>
  item.kind === "source" || item.kind === "logo"
    ? item.provenance
    : item.kind === "annotation"
      ? item.metadata.provenance
      : item.record.provenance;
function summary(item: ObservatoryCatalogueItem) {
  switch (item.kind) {
    case "annotation":
      return `${item.metadata.role}; ${item.requirement}; ${item.metadata.pinned ? "pinned" : "unpinned"}; ${item.metadata.environment ?? "no environment"}`;
    case "relation":
      return `${item.record.type}: ${item.sourceId} to ${item.targetId}; ${item.active ? "active" : "inactive"}; ${item.record.environment ?? "no environment"}`;
    case "provider":
      return `Cloudflare component ${item.componentId}; provider ${item.providerResourceId}; ${item.record.plane} plane; ${item.record.geography ?? "no geography"}; ${item.active ? "active" : "inactive"}; ${item.record.environment ?? "no environment"}`;
    case "source":
      return `${item.sourceKind}: ${item.externalId}; ${item.enabled ? "enabled" : "disabled"}; project ${item.projectId ?? "unbound, requires project review"}; ${item.freshnessSeconds} seconds; ${item.environment ?? "no environment"}`;
    case "logo":
      return `Logo ${item.digest.slice(0, 12)}; ${item.active ? "active" : "retired"}; ${item.source.kind === "upload" ? `upload ${item.source.fileName}` : `${item.source.repository} ${item.source.path} at ${item.source.commitSha.slice(0, 12)}`}`;
  }
}

export function ObservatoryReviewControls(
  props: ObservatoryReviewControlsProps,
) {
  const [kind, setKind] = useState<ObservatoryReviewKind>("annotation");
  const tabsId = useId();
  const identity = JSON.stringify([
    props.scopeKey,
    props.resource,
    props.resources,
    props.projectIds,
    props.selectedProjectId,
    kind,
  ]);
  const [current, setCurrent] = useState({
    identity,
    load: props.loadCatalogue,
    review: props.review,
    key: 0,
  });
  if (
    current.identity !== identity ||
    current.load !== props.loadCatalogue ||
    current.review !== props.review
  )
    setCurrent({
      identity,
      load: props.loadCatalogue,
      review: props.review,
      key: current.key + 1,
    });
  return (
    <details className="cmd-observatory-review" open>
      <summary>Reviewed configuration</summary>
      <div role="tablist" aria-label="Configuration kind">
        {kinds.map(([value, label]) => (
          <button
            type="button"
            role="tab"
            aria-selected={kind === value}
            id={`${tabsId}-${value}`}
            aria-controls={`${tabsId}-panel`}
            tabIndex={kind === value ? 0 : -1}
            key={value}
            onClick={() => setKind(value)}
            onKeyDown={(event) => {
              const index = kinds.findIndex(([entry]) => entry === value);
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % kinds.length
                  : event.key === "ArrowLeft"
                    ? (index + kinds.length - 1) % kinds.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? kinds.length - 1
                        : null;
              if (next === null) return;
              event.preventDefault();
              setKind(kinds[next]![0]);
              event.currentTarget.parentElement
                ?.querySelectorAll<HTMLButtonElement>("button")
                [next]?.focus();
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${tabsId}-panel`}
        aria-labelledby={`${tabsId}-${kind}`}
      >
        <ReviewPanel key={current.key} {...props} kind={kind} />
      </div>
    </details>
  );
}
function ReviewPanel(
  currentProps: ObservatoryReviewControlsProps & {
    kind: ObservatoryReviewKind;
  },
) {
  const [props] = useState(() => currentProps);
  const onReviewed = useRef(currentProps.onReviewed);
  useLayoutEffect(() => {
    onReviewed.current = currentProps.onReviewed;
  }, [currentProps.onReviewed]);
  const { kind } = props;
  const [items, setItems] = useState<ObservatoryCatalogueItem[] | null>(null),
    [error, setError] = useState<string | null>(null),
    [query, setQuery] = useState(""),
    [draft, setDraft] = useState<Draft | null>(null),
    [saving, setSaving] = useState(false),
    [loading, setLoading] = useState(true),
    [reload, setReload] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    const ticket = ++generation.current;
    setItems(null);
    setLoading(true);
    setError(null);
    void Promise.resolve()
      .then(() => props.loadCatalogue(kind, props.resource.id))
      .then((raw) => {
        if (generation.current !== ticket) return;
        setItems(catalogue(raw, props, kind));
      })
      .catch(() => {
        if (generation.current === ticket)
          setError(
            "Configuration is unavailable. Reload the catalogue to review.",
          );
      })
      .finally(() => {
        if (generation.current === ticket) setLoading(false);
      });
    return () => {
      generation.current++;
    };
    // The keyed panel owns one immutable scope/resource/kind/client context.
  }, [reload, props, kind]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || items === null || saving || loading) return;
    const ticket = generation.current;
    let input: unknown;
    try {
      input = change(draft, kind, props);
    } catch {
      setError(
        "Review the required fields, typed endpoints, project, evidence references and note before submitting.",
      );
      return;
    }
    setSaving(true);
    setError(null);
    let accepted = false;
    try {
      const raw = await props.review(kind, input);
      if (generation.current !== ticket) return;
      const confirmed = receipt(raw, draft);
      accepted = true;
      setItems(null);
      const refreshed = await props.loadCatalogue(kind, props.resource.id);
      if (generation.current !== ticket) return;
      const current = catalogue(refreshed, props, kind);
      if (
        !current.some(
          (item) =>
            item.id.toLowerCase() === confirmed.id &&
            item.version >= confirmed.version,
        )
      )
        throw new Error("Accepted version is not in the current catalogue");
      setItems(current);
      setDraft(null);
      onReviewed.current();
    } catch {
      if (generation.current === ticket)
        setError(
          accepted
            ? "Review accepted, but the catalogue is unavailable. Reload and review the current version."
            : "Review could not be confirmed. Your draft is retained. Reload and review the current version if it changed, then retry.",
        );
    } finally {
      if (generation.current === ticket) setSaving(false);
    }
  }
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((old) => (old ? { ...old, [key]: value } : old));
  function text(label: string, key: keyof Draft, type = "text") {
    return (
      <label>
        {label}
        <input
          type={type}
          value={String(draft?.[key] ?? "")}
          onChange={(event) => update(key, event.target.value)}
        />
      </label>
    );
  }
  function select(
    label: string,
    key: keyof Draft,
    options: readonly (readonly [string, string])[],
    placeholder?: string,
  ) {
    return (
      <label>
        {label}
        <select
          value={String(draft?.[key] ?? "")}
          onChange={(event) => update(key, event.target.value)}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map(([value, name]) => (
            <option key={value} value={value}>
              {name}
            </option>
          ))}
        </select>
      </label>
    );
  }
  function checkbox(label: string, key: "pinned" | "active" | "enabled") {
    return (
      <label className="cmd-observatory-review__check">
        <input
          type="checkbox"
          checked={draft?.[key] ?? false}
          onChange={(event) => update(key, event.target.checked)}
        />
        {label}
      </label>
    );
  }
  const resourceOptions = props.resources.map(
    (row) => [row.id, `${row.name} (${row.kind}; ${row.id})`] as const,
  );
  return (
    <section aria-label={`${kind} configuration`}>
      <p>{props.resource.name}</p>
      {loading && <p role="status">Loading reviewed configuration...</p>}
      {error && <p role="alert">{error}</p>}
      <button
        type="button"
        disabled={loading || saving}
        onClick={() => {
          setDraft(null);
          setReload((old) => old + 1);
        }}
      >
        Reload catalogue
      </button>
      {items !== null && (
        <>
          <label>
            Search reviewed configuration
            <input value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <p>{items.length} reviewed records, including inactive records.</p>
          <ul className="cmd-observatory-review__records">
            {items
              .filter((item) =>
                JSON.stringify(item)
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              )
              .map((item) => {
                const recorded = provenance(item);
                return (
                  <li key={item.id}>
                    <h4>{summary(item)}</h4>
                    <p>
                      Record {item.id}. Version {item.version}.
                    </p>
                    <p>
                      Recorded by {recorded.actorId} at {recorded.recordedAt}
                    </p>
                    <ul aria-label="Recorded evidence">
                      {recorded.evidenceRefs.map((reference, index) => (
                        <li key={index}>{reference}</li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        setDraft(draftFor(props, kind, item));
                        setError(null);
                      }}
                    >
                      Edit {item.id}
                    </button>
                  </li>
                );
              })}
          </ul>
          {items.length === 0 && (
            <p>No reviewed configuration for this kind.</p>
          )}
          {(kind !== "annotation" || items.length === 0) && (
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setDraft(draftFor(props, kind));
                setError(null);
              }}
            >
              Create {kind === "provider" ? "provider dependency" : kind}
            </button>
          )}
        </>
      )}
      {draft && (
        <form onSubmit={save} aria-label="Review configuration">
          <p>
            Record {draft.id}. Expected version {draft.expectedVersion}.
          </p>
          <fieldset disabled={saving || loading || items === null}>
            <legend>Explicit owner review</legend>
            {kind === "annotation" && (
              <>
                {select("Operational role", "role", [
                  ["unknown", "Unknown"],
                  ["operated", "Operated"],
                ])}
                <p>
                  Operated records an ownership role. It does not imply healthy.
                </p>
                {checkbox("Pinned", "pinned")}
                {select("Requirement", "requirement", [
                  ["unspecified", "Unspecified"],
                  ["required", "Required"],
                  ["optional", "Optional"],
                ])}
              </>
            )}
            {kind === "relation" && (
              <>
                {select(
                  "Relationship type",
                  "relationType",
                  [
                    ["deploys", "Deploys"],
                    ["executes_on", "Executes on"],
                    ["provides_service", "Provides service"],
                    ["depends_on", "Depends on"],
                  ],
                  "Choose a relationship",
                )}
                {select(
                  "Source resource",
                  "sourceId",
                  resourceOptions,
                  "Choose source",
                )}
                {select(
                  "Target resource",
                  "targetId",
                  resourceOptions,
                  "Choose target",
                )}
                {checkbox("Active", "active")}
              </>
            )}
            {kind === "provider" && (
              <>
                {select(
                  "Provider",
                  "providerId",
                  resourceOptions.filter(
                    ([id]) =>
                      props.resources.find((row) => row.id === id)?.kind ===
                      "provider",
                  ),
                  "Choose provider",
                )}
                {text("Stable Cloudflare component ID", "componentId")}
                <p>
                  Use the reviewed stable component ID exactly. Names do not
                  infer a dependency.
                </p>
                {text("Geography (optional)", "geography")}
                {select(
                  "Plane",
                  "plane",
                  [
                    ["control", "Control"],
                    ["data", "Data"],
                  ],
                  "Choose a plane",
                )}
                {checkbox("Active", "active")}
              </>
            )}
            {kind === "source" && (
              <>
                {select(
                  "Project",
                  "projectId",
                  props.projectIds
                    .filter(
                      (id) =>
                        props.selectedProjectId === null ||
                        id === props.selectedProjectId,
                    )
                    .map((id) => [id, id] as const),
                  "Choose a project",
                )}
                <p>Legacy unbound sources require explicit project review.</p>
                {select(
                  "Source kind",
                  "sourceKind",
                  [
                    ["http-readiness", "Commandry web readiness"],
                    ["github-repository", "GitHub repository"],
                    ["infraagent-monitor", "Optional InfraAgent monitor"],
                  ],
                  "Choose a source kind",
                )}
                {text("Reviewed external ID", "externalId")}
                {draft.sourceKind === "http-readiness" && (
                  <p>
                    Bind only the actual Commandry web service. Its fixed check
                    ID is commandry-web-readiness. This observes the configured
                    Commandry readiness endpoint and does not establish external
                    user availability.
                  </p>
                )}
                {text(
                  "Freshness seconds (30 to 86400)",
                  "freshnessSeconds",
                  "number",
                )}
                {checkbox("Enabled", "enabled")}
                <p>
                  Enabling schedules server-side reads with the configured
                  reader. Optional credentials stay on the server. Credentials
                  and monitoring origins are not entered here.
                </p>
              </>
            )}
            {text("Environment (optional)", "environment")}
            <label>
              Evidence references (one per line)
              <textarea
                value={draft.evidence}
                onChange={(e) => update("evidence", e.target.value)}
              />
            </label>
            <label>
              Review note
              <textarea
                value={draft.note}
                onChange={(e) => update("note", e.target.value)}
              />
            </label>
            <p>
              Submitting this review records the signed-in owner&apos;s
              approval.
            </p>
            <button type="submit">
              {saving ? "Submitting review..." : "Submit review"}
            </button>
          </fieldset>
          <button
            type="button"
            disabled={saving}
            onClick={() => setDraft(null)}
          >
            Cancel draft
          </button>
        </form>
      )}
    </section>
  );
}
