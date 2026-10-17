"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  foundationProjectWorkCursorSchema,
  foundationProjectWorkPageSchema,
  type FoundationProjectWorkCursor,
  type FoundationProjectWorkPage,
  type FoundationProjectWorkRecord,
} from "@commandry/contracts";
import "./observatory-work-dock.css";

export type ObservatoryWorkDockProps = {
  projectIds: string[];
  selectedProjectId: string | null;
  loadPage: (
    projectId: string,
    cursor: FoundationProjectWorkCursor | null,
  ) => Promise<FoundationProjectWorkPage>;
  paused?: boolean;
  /** A known local canonical Work page route, supplied by the host application. */
  workPageHref?: string;
};
type Scope = { projects: string[]; valid: boolean };
type Context = {
  projectId: string;
  contextLink: FoundationProjectWorkRecord["contextLink"];
};
type Work = {
  work: FoundationProjectWorkRecord;
  canonical: string;
  contexts: Context[];
};
type State = {
  scope: Scope | null;
  loader: ObservatoryWorkDockProps["loadPage"] | null;
  revision: number;
  status: "loading" | "ready" | "unavailable" | "paused" | "no-scope";
  items: Work[];
};
const types = { task: "Task", initiative: "Initiative", subtask: "Subtask" };
const assignments = {
  unassigned: "Unassigned",
  local_user: "Local user",
  agent: "Agent",
};

function scopeFromJson(value: string): Scope {
  try {
    const input = JSON.parse(value) as {
      projectIds: string[];
      selectedProjectId: string | null;
    };
    const identity = foundationProjectWorkCursorSchema.shape.projectId;
    const projects = [
      ...new Set(input.projectIds.map((id) => identity.parse(id))),
    ].sort();
    const selected =
      input.selectedProjectId === null
        ? null
        : identity.parse(input.selectedProjectId);
    if (selected !== null && !projects.includes(selected)) throw new Error();
    return { projects: selected === null ? projects : [selected], valid: true };
  } catch {
    return { projects: [], valid: false };
  }
}

function jsonData(value: unknown, seen = new Set<object>(), depth = 0): void {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  )
    return;
  if (typeof value !== "object" || depth > 64 || seen.has(value))
    throw new Error();
  const array = Array.isArray(value);
  if (
    !array &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    throw new Error();
  if (Object.getOwnPropertySymbols(value).length) throw new Error();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (array && Object.keys(descriptors).length !== value.length + 1)
    throw new Error();
  seen.add(value);
  for (const [name, descriptor] of Object.entries(descriptors)) {
    if (array && name === "length") continue;
    if (
      !descriptor.enumerable ||
      !Object.hasOwn(descriptor, "value") ||
      (array &&
        (!/^(0|[1-9][0-9]*)$/.test(name) || Number(name) >= value.length))
    )
      throw new Error();
    jsonData(descriptor.value, seen, depth + 1);
  }
  seen.delete(value);
}

function canonicalContent(work: FoundationProjectWorkRecord): string {
  // The strict contract fixes canonical field order; contextLink is scoped membership.
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(work).filter(([key]) => key !== "contextLink"),
    ),
  );
}
function safeWorkPageHref(value: string | undefined): string | null {
  return value &&
    /^\/(?!\/)/.test(value) &&
    !/[\s\\\u0000-\u001f\u007f]/.test(value)
    ? value
    : null;
}

export function ObservatoryWorkDock({
  projectIds,
  selectedProjectId,
  loadPage,
  paused = false,
  workPageHref,
}: ObservatoryWorkDockProps) {
  const titleId = useId();
  const serializedScope = JSON.stringify({
    projectIds,
    selectedProjectId,
    paused,
  });
  const scope = useMemo(
    () => scopeFromJson(serializedScope),
    [serializedScope],
  );
  const generation = useRef(0);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<State>({
    scope: null,
    loader: null,
    revision: -1,
    status: "loading",
    items: [],
  });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [workType, setWorkType] = useState("all");
  const [assignment, setAssignment] = useState("all");

  useEffect(() => {
    const currentGeneration = ++generation.current;
    let live = true;
    const current = () => live && generation.current === currentGeneration;
    const stamp = { scope, loader: loadPage, revision };
    if (!paused && scope.valid && scope.projects.length > 0) {
      async function readProject(projectId: string): Promise<Work[]> {
        const items: Work[] = [],
          cursors = new Set<string>(),
          identities = new Set<string>();
        let cursor: FoundationProjectWorkCursor | null = null;
        do {
          if (!current()) return [];
          const value: unknown = await loadPage(
            projectId,
            cursor === null ? null : { ...cursor },
          );
          if (!current()) return [];
          jsonData(value);
          const page = foundationProjectWorkPageSchema.parse(value);
          if (page.requestedProjectId !== projectId) throw new Error();
          for (const { work } of page.items) {
            const id = work.id.toLowerCase();
            if (identities.has(id)) throw new Error();
            identities.add(id);
            items.push({
              work,
              canonical: canonicalContent(work),
              contexts: [{ projectId, contextLink: work.contextLink }],
            });
          }
          cursor = page.nextCursor;
          if (cursor !== null) {
            const key = JSON.stringify(cursor);
            if (cursors.has(key)) throw new Error();
            cursors.add(key);
          }
        } while (cursor !== null);
        return items;
      }
      void (async () => {
        try {
          const pages = await Promise.all(scope.projects.map(readProject));
          if (!current()) return;
          const identities = new Map<string, Work>();
          for (const item of pages.flat()) {
            const id = item.work.id.toLowerCase(),
              existing = identities.get(id);
            if (existing) {
              if (existing.canonical !== item.canonical) throw new Error();
              existing.contexts.push(...item.contexts);
            } else identities.set(id, item);
          }
          setState({
            ...stamp,
            status: "ready",
            items: [...identities.values()],
          });
        } catch {
          if (current()) {
            live = false;
            setState({ ...stamp, status: "unavailable", items: [] });
          }
        }
      })();
    }
    return () => {
      live = false;
    };
  }, [scope, loadPage, paused, revision]);

  const current =
    state.scope === scope &&
    state.loader === loadPage &&
    state.revision === revision;
  const viewStatus = paused
    ? "paused"
    : !scope.valid
      ? "unavailable"
      : !scope.projects.length
        ? "no-scope"
        : current
          ? state.status
          : "loading";
  const items = viewStatus === "ready" ? state.items : [];
  const term = search.trim().toLocaleLowerCase();
  const shown = items.filter(
    ({ work, contexts }) =>
      (status === "all" || work.status === status) &&
      (workType === "all" || work.workType === workType) &&
      (assignment === "all" || work.assigneeKind === assignment) &&
      (!term ||
        [
          work.title,
          work.description,
          work.id,
          work.projectId,
          work.assigneeLabel ?? "",
          work.assigneeAgentId ?? "",
          ...contexts.map((context) => context.projectId),
        ].some((text) => text.toLocaleLowerCase().includes(term))),
  );
  const href = safeWorkPageHref(workPageHref);

  return (
    <section className="cmd-observatory-work-dock" aria-labelledby={titleId}>
      <header className="cmd-work-dock-heading">
        <h2 id={titleId}>Project Work</h2>
        {href && <a href={href}>Open canonical Work</a>}
      </header>
      <p className="cmd-work-dock-note">
        Canonical tasks, initiatives and subtasks. Live paginated Work has no
        as-of snapshot guarantee; modified dates describe edits.
      </p>
      <p className="cmd-work-dock-runtime" role="note">
        Actual runtime unavailable. Assignment is not an active run.
      </p>
      {viewStatus === "paused" && (
        <p role="status">Work loading paused. Totals unavailable.</p>
      )}
      {viewStatus === "loading" && (
        <p role="status">Loading all Work pages. Totals unavailable.</p>
      )}
      {viewStatus === "no-scope" && (
        <p role="status">
          No authorized project context. Work totals unavailable.
        </p>
      )}
      {viewStatus === "unavailable" && (
        <div role="alert">
          <p>
            Work unavailable. A complete authorized read could not be loaded.
            Totals unavailable.
          </p>
          <button
            type="button"
            onClick={() => setRevision((value) => value + 1)}
          >
            Retry Work
          </button>
        </div>
      )}
      {viewStatus === "ready" && (
        <>
          <p className="cmd-work-dock-total">
            <strong>
              {items.length} Work {items.length === 1 ? "item" : "items"}
            </strong>
            <span>
              Across {scope.projects.length} authorized project{" "}
              {scope.projects.length === 1 ? "context" : "contexts"}.
            </span>
          </p>
          <div className="cmd-work-dock-filters">
            <label>
              Search Work
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <label>
              Work status
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="all">All statuses</option>
                <option value="open">Open</option>
                <option value="done">Done</option>
              </select>
            </label>
            <label>
              Work type
              <select
                value={workType}
                onChange={(event) => setWorkType(event.target.value)}
              >
                <option value="all">All types</option>
                {Object.entries(types).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Assignment
              <select
                value={assignment}
                onChange={(event) => setAssignment(event.target.value)}
              >
                <option value="all">All assignments</option>
                {Object.entries(assignments).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p role="status">
            Showing {shown.length} of {items.length} Work items.
          </p>
          {!items.length && (
            <p>No canonical Work items in this project context.</p>
          )}
          {!!items.length && !shown.length && (
            <p>No Work matches these filters.</p>
          )}
          {!!shown.length && (
            <div
              className="cmd-work-dock-scroll"
              role="region"
              aria-label="Scrollable canonical Work"
              tabIndex={0}
            >
              <ul aria-label="Canonical Work items">
                {shown.map(({ work, contexts }) => (
                  <li key={work.id.toLowerCase()}>
                    <details>
                      <summary
                        aria-label={
                          work.title ? undefined : `Work item ${work.id}`
                        }
                      >
                        <span className="cmd-work-dock-title">
                          {work.title}
                        </span>
                        <span className="cmd-work-dock-badge">
                          {types[work.workType]}
                        </span>
                        <span className="cmd-work-dock-badge">
                          {work.status === "done" ? "Done" : "Open"}
                        </span>
                      </summary>
                      <div className="cmd-work-dock-body">
                        <p className="cmd-work-dock-description">
                          {work.description}
                        </p>
                        <dl>
                          <dt>Canonical ID</dt>
                          <dd>{work.id}</dd>
                          <dt>Primary project</dt>
                          <dd>{work.projectId}</dd>
                          <dt>Assignment</dt>
                          <dd>{assignments[work.assigneeKind]}</dd>
                          <dt>Assignee label</dt>
                          <dd>{work.assigneeLabel ?? "No label"}</dd>
                          <dt>Assignee agent ID</dt>
                          <dd>{work.assigneeAgentId ?? "None"}</dd>
                          <dt>Priority</dt>
                          <dd>{work.priority ?? "Unspecified"}</dd>
                          <dt>Due date</dt>
                          <dd>
                            {work.dueOn === null ? (
                              "No due date"
                            ) : (
                              <time dateTime={work.dueOn}>{work.dueOn}</time>
                            )}
                          </dd>
                          <dt>Created</dt>
                          <dd>
                            <time dateTime={work.createdAt}>
                              {work.createdAt}
                            </time>
                          </dd>
                          <dt>Modified</dt>
                          <dd>
                            <time dateTime={work.updatedAt}>
                              {work.updatedAt}
                            </time>
                          </dd>
                          <dt>Source capture</dt>
                          <dd>{work.sourceCaptureId}</dd>
                          <dt>Generated from Work</dt>
                          <dd>{work.generatedFromWorkItemId ?? "None"}</dd>
                          <dt>Project contexts in this read</dt>
                          <dd>
                            <ul>
                              {contexts.map((context) => (
                                <li key={context.projectId}>
                                  {context.projectId ===
                                  work.projectId.toLowerCase()
                                    ? "Primary project: "
                                    : "Active project context: "}
                                  {context.projectId}
                                  {context.contextLink !== null && (
                                    <span>
                                      {" "}
                                      Context link {context.contextLink.id},
                                      created{" "}
                                      <time
                                        dateTime={context.contextLink.createdAt}
                                      >
                                        {context.contextLink.createdAt}
                                      </time>
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </dd>
                        </dl>
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
