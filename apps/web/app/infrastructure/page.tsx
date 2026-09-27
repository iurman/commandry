"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  AppShell,
  Button,
  RecordEmptyState,
  ResourceTreeRow,
} from "@commandry/ui";
import {
  apiJson,
  pagePath,
  type PageResponse,
  type ResourceRecord,
} from "../projects/api";

interface BranchState {
  expanded: boolean;
  loaded: boolean;
  loading: boolean;
  error: string | null;
  items: ResourceRecord[];
  nextCursor: string | null;
}

const emptyBranch: BranchState = {
  expanded: false,
  loaded: false,
  loading: false,
  error: null,
  items: [],
  nextCursor: null,
};

function errorMessage(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}

export default function InfrastructurePage() {
  const [roots, setRoots] = useState<ResourceRecord[]>([]);
  const [rootCursor, setRootCursor] = useState<string | null>(null);
  const [rootsLoading, setRootsLoading] = useState(true);
  const [moreRootsLoading, setMoreRootsLoading] = useState(false);
  const [rootsError, setRootsError] = useState<string | null>(null);
  const [branches, setBranches] = useState<Record<string, BranchState>>({});
  const [name, setName] = useState("");
  const [kind, setKind] = useState("service");
  const [subtype, setSubtype] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createFeedback, setCreateFeedback] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiJson<PageResponse<ResourceRecord>>(pagePath("/api/v1/resources/roots"))
      .then((page) => {
        if (!active) return;
        setRoots(page.items);
        setRootCursor(page.nextCursor);
        setRootsError(null);
      })
      .catch((cause: unknown) => {
        if (active)
          setRootsError(errorMessage(cause, "Resource roots are unavailable."));
      })
      .finally(() => {
        if (active) setRootsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function loadMoreRoots() {
    if (!rootCursor || moreRootsLoading) return;
    setMoreRootsLoading(true);
    setRootsError(null);
    try {
      const page = await apiJson<PageResponse<ResourceRecord>>(
        pagePath("/api/v1/resources/roots", rootCursor),
      );
      setRoots((current) => [
        ...current,
        ...page.items.filter(
          (item) => !current.some((saved) => saved.id === item.id),
        ),
      ]);
      setRootCursor(page.nextCursor);
    } catch (cause) {
      setRootsError(errorMessage(cause, "Could not load more resources."));
    } finally {
      setMoreRootsLoading(false);
    }
  }

  async function loadChildren(resourceId: string, cursor?: string) {
    setBranches((current) => ({
      ...current,
      [resourceId]: {
        ...(current[resourceId] ?? emptyBranch),
        loading: true,
        error: null,
      },
    }));
    try {
      const page = await apiJson<PageResponse<ResourceRecord>>(
        pagePath(
          `/api/v1/resources/${encodeURIComponent(resourceId)}/children`,
          cursor,
        ),
      );
      setBranches((current) => {
        const previous = current[resourceId] ?? emptyBranch;
        return {
          ...current,
          [resourceId]: {
            ...previous,
            loaded: true,
            loading: false,
            error: null,
            items: cursor
              ? [
                  ...previous.items,
                  ...page.items.filter(
                    (item) =>
                      !previous.items.some((saved) => saved.id === item.id),
                  ),
                ]
              : page.items,
            nextCursor: page.nextCursor,
          },
        };
      });
    } catch (cause) {
      setBranches((current) => ({
        ...current,
        [resourceId]: {
          ...(current[resourceId] ?? emptyBranch),
          loading: false,
          error: errorMessage(cause, "Could not load child resources."),
        },
      }));
    }
  }

  function toggle(resourceId: string) {
    const branch = branches[resourceId] ?? emptyBranch;
    setBranches((current) => ({
      ...current,
      [resourceId]: {
        ...(current[resourceId] ?? emptyBranch),
        expanded: !branch.expanded,
      },
    }));
    if (!branch.expanded && !branch.loaded && !branch.loading) {
      void loadChildren(resourceId);
    }
  }

  async function createResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !kind.trim() || creating) return;
    setCreating(true);
    setCreateError(null);
    setCreateFeedback(null);
    try {
      const created = await apiJson<ResourceRecord>("/api/v1/resources", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          kind: kind.trim(),
          ...(subtype.trim() ? { subtype: subtype.trim() } : {}),
        }),
      });
      setRoots((current) => [created, ...current]);
      setName("");
      setSubtype("");
      setCreateFeedback(
        "Resource created with unknown health. Open it to choose a parent or dependency.",
      );
    } catch (cause) {
      setCreateError(errorMessage(cause, "Could not create resource."));
    } finally {
      setCreating(false);
    }
  }

  function renderResource(resource: ResourceRecord) {
    const branch = branches[resource.id] ?? emptyBranch;
    return (
      <li key={resource.id}>
        <ResourceTreeRow
          expanded={branch.expanded}
          onToggle={() => toggle(resource.id)}
          resource={resource}
        />
        {branch.expanded && (
          <div>
            {branch.loading && <p role="status">Loading children...</p>}
            {branch.error && (
              <p className="cmd-inline-state cmd-error" role="alert">
                {branch.error}
              </p>
            )}
            {branch.loaded && branch.items.length === 0 && (
              <p className="cmd-inline-state">No child resources recorded.</p>
            )}
            {branch.items.length > 0 && (
              <ul aria-label={`Children of ${resource.name}`}>
                {branch.items.map(renderResource)}
              </ul>
            )}
            {branch.nextCursor && (
              <Button
                disabled={branch.loading}
                onClick={() =>
                  loadChildren(resource.id, branch.nextCursor ?? undefined)
                }
                type="button"
              >
                Load more children of {resource.name}
              </Button>
            )}
            {branch.error && (
              <Button onClick={() => loadChildren(resource.id)} type="button">
                Retry children of {resource.name}
              </Button>
            )}
          </div>
        )}
      </li>
    );
  }

  return (
    <AppShell current="Infrastructure">
      <header className="cmd-page-header cmd-workspace-heading">
        <div>
          <p className="cmd-eyebrow">Resource explorer / Local records</p>
          <h1>Infrastructure</h1>
          <p className="cmd-lead">
            Browse one primary containment tree. Dependency links and project
            relationships stay separate, so a resource keeps one canonical ID.
          </p>
          <p className="cmd-record-identity">
            <a href="/systems">
              Browse operated systems and their supporting resources
            </a>
          </p>
        </div>
        <span className="cmd-headline-mark" aria-hidden="true">
          03 / Connect
        </span>
      </header>
      <div className="cmd-infrastructure-grid">
        <section
          className="cmd-create-panel"
          aria-labelledby="resource-create-heading"
        >
          <div className="cmd-section-heading">
            <div>
              <p className="cmd-eyebrow">Manual inventory</p>
              <h2 id="resource-create-heading">Add a resource</h2>
            </div>
          </div>
          <p className="cmd-form-intro">
            This local record does not inspect a host or service. Operational
            health stays unknown until a named real observation exists.
          </p>
          <form className="cmd-form" onSubmit={createResource}>
            <label htmlFor="resource-name">Name *</label>
            <input
              id="resource-name"
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
            <label htmlFor="resource-kind">Kind *</label>
            <input
              id="resource-kind"
              onChange={(event) => setKind(event.target.value)}
              required
              value={kind}
            />
            <label htmlFor="resource-subtype">Subtype (optional)</label>
            <input
              id="resource-subtype"
              onChange={(event) => setSubtype(event.target.value)}
              value={subtype}
            />
            {createError && (
              <p className="cmd-form-error" role="alert">
                {createError}
              </p>
            )}
            {createFeedback && (
              <p className="cmd-form-success" role="status">
                {createFeedback}
              </p>
            )}
            <Button
              disabled={creating || !name.trim() || !kind.trim()}
              type="submit"
              variant="primary"
            >
              {creating ? "Saving resource..." : "Add resource"}
            </Button>
          </form>
        </section>
        <section
          className="cmd-inbox-queue"
          aria-labelledby="resource-tree-heading"
        >
          <div className="cmd-section-heading">
            <div>
              <p className="cmd-eyebrow">Primary hierarchy</p>
              <h2 id="resource-tree-heading">Resource tree</h2>
            </div>
            {!rootsLoading && (
              <span className="cmd-count">{roots.length} roots shown</span>
            )}
          </div>
          {rootsLoading && <p role="status">Loading root resources...</p>}
          {rootsError && (
            <p className="cmd-inline-state cmd-error" role="alert">
              {rootsError}
            </p>
          )}
          {!rootsLoading && roots.length === 0 && !rootsError && (
            <RecordEmptyState
              description="Add a manual resource to begin a local hierarchy."
              title="No resources yet"
            />
          )}
          {roots.length > 0 && (
            <ul className="cmd-resource-tree" aria-label="Resource hierarchy">
              {roots.map(renderResource)}
            </ul>
          )}
          {rootCursor && (
            <Button
              disabled={moreRootsLoading}
              onClick={loadMoreRoots}
              type="button"
            >
              {moreRootsLoading ? "Loading..." : "Load more root resources"}
            </Button>
          )}
        </section>
      </div>
    </AppShell>
  );
}
