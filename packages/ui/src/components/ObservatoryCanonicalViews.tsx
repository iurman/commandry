"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ObservatoryView,
  ObservatoryViewCreate,
  ObservatoryViewUpdate,
  ObservatoryViewDelete,
  ObservatoryViewPageQuery,
  ObservatoryViewPage,
  ObservatoryViewDeleted,
  ObservatoryViewConfiguration,
} from "@commandry/contracts";

export type ObservatoryViewsClient = {
  page(input: ObservatoryViewPageQuery): Promise<ObservatoryViewPage>;
  create(input: ObservatoryViewCreate): Promise<ObservatoryView>;
  update(input: ObservatoryViewUpdate): Promise<ObservatoryView>;
  delete(input: ObservatoryViewDelete): Promise<ObservatoryViewDeleted>;
};
export function ObservatoryCanonicalViews({
  client,
  projectId,
  configuration,
  onApply,
}: {
  client?: ObservatoryViewsClient | undefined;
  projectId: string | null;
  configuration: ObservatoryViewConfiguration;
  onApply: (configuration: ObservatoryViewConfiguration) => void;
}) {
  const [views, setViews] = useState<ObservatoryView[]>([]),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(!!client),
    [error, setError] = useState<string | null>(null);
  const generation = useRef(0),
    retry = useRef<ObservatoryViewCreate | null>(null);
  const refresh = useCallback(
    async (ticket: number) => {
      if (!client) return;
      const scopes = projectId ? [null, projectId] : [null];
      const items: ObservatoryView[] = [];
      for (const scope of scopes) {
        let cursor: string | null = null,
          total: number | null = null;
        const seen = new Set<string>();
        let loaded = 0;
        do {
          const page = await client.page({
            projectId: scope,
            cursor,
            limit: 100,
          });
          if (generation.current !== ticket) return;
          if (total !== null && page.total !== total)
            throw new Error("View collection changed. Refresh to retry.");
          total = page.total;
          loaded += page.items.length;
          if (page.items.some((view) => view.projectId !== scope))
            throw new Error("Invalid view scope.");
          items.push(...page.items);
          cursor = page.nextCursor;
          if (cursor) {
            if (seen.has(cursor)) throw new Error("Invalid view continuation.");
            seen.add(cursor);
          }
        } while (cursor);
        if (loaded !== total) throw new Error("Incomplete view collection.");
      }
      if (new Set(items.map((view) => view.id)).size !== items.length)
        throw new Error("Duplicate view identity.");
      if (generation.current === ticket) setViews(items);
    },
    [client, projectId],
  );
  useEffect(() => {
    const ticket = ++generation.current;
    if (client) {
      void refresh(ticket)
        .catch(() => {
          if (generation.current === ticket)
            setError(
              "Cross-device views are unavailable. Sign in as the owner or retry.",
            );
        })
        .finally(() => {
          if (generation.current === ticket) setBusy(false);
        });
    }
    return () => {
      generation.current = ticket + 1;
    };
  }, [client, refresh]);
  async function act(operation: () => Promise<unknown>) {
    if (busy || !client) return;
    const ticket = generation.current;
    setBusy(true);
    setError(null);
    try {
      await operation();
      if (generation.current === ticket) {
        retry.current = null;
        setName("");
        await refresh(ticket);
      }
    } catch {
      if (generation.current === ticket)
        setError(
          "The view was not confirmed. Retry the same save, or refresh after a version conflict.",
        );
    } finally {
      if (generation.current === ticket) setBusy(false);
    }
  }
  return (
    <fieldset aria-busy={busy}>
      <legend>Private cross-device views</legend>
      <p>
        Saved to your owner account. Applying a view changes presentation only.
      </p>
      {!client ? (
        <p>Owner sign-in is required to save cross-device views.</p>
      ) : (
        <>
          {error && <p role="alert">{error}</p>}
          <label>
            Account view name
            <input
              maxLength={100}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                retry.current = null;
              }}
            />
          </label>
          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={() =>
              void act(async () => {
                if (!retry.current)
                  retry.current = {
                    id: crypto.randomUUID(),
                    projectId,
                    name: name.trim(),
                    expectedVersion: 0,
                    configuration,
                  };
                await client.create(retry.current);
              })
            }
          >
            Save account view
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void act(() => refresh(generation.current))}
          >
            Refresh account views
          </button>
          {busy && <p role="status">Loading account views...</p>}
          {!busy && !error && !views.length && (
            <p>No account views in this scope.</p>
          )}
          <ul aria-label="Account views">
            {views.map((view) => (
              <li key={view.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onApply(view.configuration)}
                >
                  Apply {view.name}
                </button>
                <span>
                  {view.projectId ? "Project view" : "Global view"}, version{" "}
                  {view.version}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void act(() =>
                      client.update({
                        id: view.id,
                        projectId: view.projectId,
                        name: view.name,
                        expectedVersion: view.version,
                        configuration,
                      }),
                    )
                  }
                >
                  Replace {view.name} with current view
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void act(() =>
                      client.delete({
                        id: view.id,
                        expectedVersion: view.version,
                      }),
                    )
                  }
                >
                  Delete account view {view.name}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </fieldset>
  );
}
