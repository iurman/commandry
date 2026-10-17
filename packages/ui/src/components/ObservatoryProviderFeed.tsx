"use client";

import { useEffect, useMemo, useState } from "react";
import {
  observatoryProviderFeedResultSchema,
  type ObservatoryProviderFeedQuery,
  type ObservatoryProviderFeedResult,
} from "@commandry/contracts";
import "./observatory-provider-feed.css";

export type ObservatoryProviderFeedClient = (
  cursor: ObservatoryProviderFeedQuery["cursor"],
) => Promise<unknown>;
export type ObservatoryProviderFeedProps = {
  scopeKey: string;
  loadPage: ObservatoryProviderFeedClient;
  paused?: boolean;
};
type Read = {
  scope: string;
  loader: ObservatoryProviderFeedClient;
  status: "ready" | "unavailable";
  feed: ObservatoryProviderFeedResult["feed"] | null;
  items: ObservatoryProviderFeedResult["items"];
};

/** Reads the recorded public feed. Local impact is explained separately by the
 * authorized landscape's reviewed dependency and availability observations. */
export function ObservatoryProviderFeed({
  scopeKey,
  loadPage,
  paused = false,
}: ObservatoryProviderFeedProps) {
  const [read, setRead] = useState<Read | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  useEffect(() => {
    if (paused) return;
    const refresh = () => {
      if (!document.hidden) setEpoch((value) => value + 1);
    };
    const timer = setInterval(refresh, 120000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [paused]);
  useEffect(() => {
    if (paused) return;
    let current = true;
    void (async () => {
      try {
        let cursor: ObservatoryProviderFeedQuery["cursor"] = null;
        let feed: ObservatoryProviderFeedResult["feed"] | null = null;
        const items: ObservatoryProviderFeedResult["items"] = [];
        const identities = new Set<string>();
        const cursors = new Set<string>();
        do {
          const page = observatoryProviderFeedResultSchema.parse(
            await loadPage(cursor),
          );
          if (!current) return;
          if (
            page.scopeDigest !== scopeKey ||
            (feed &&
              (page.feed.revision !== feed.revision ||
                JSON.stringify(page.feed) !== JSON.stringify(feed)))
          )
            throw new Error();
          feed ??= page.feed;
          for (const item of page.items) {
            if (identities.has(item.id)) throw new Error();
            identities.add(item.id);
            items.push(item);
          }
          cursor = page.nextCursor;
          if (cursor) {
            if (cursors.has(cursor.afterId) || page.items.length === 0)
              throw new Error();
            cursors.add(cursor.afterId);
          }
        } while (cursor);
        if (current)
          setRead({
            scope: scopeKey,
            loader: loadPage,
            status: "ready",
            feed,
            items,
          });
      } catch {
        if (current)
          setRead({
            scope: scopeKey,
            loader: loadPage,
            status: "unavailable",
            feed: null,
            items: [],
          });
      }
    })();
    return () => {
      current = false;
    };
  }, [scopeKey, loadPage, paused, epoch]);
  const selected =
    read?.scope === scopeKey && read.loader === loadPage ? read : null;
  const items = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (selected?.items ?? []).filter(
      ({ record }) =>
        (kind === "all" || record.kind === kind) &&
        (!query ||
          [
            record.id,
            record.title,
            record.status,
            record.severity,
            ...record.componentIds,
            ...record.updates.map((update) => update.body),
          ]
            .join(" ")
            .toLowerCase()
            .includes(query)),
    );
  }, [selected, search, kind]);
  const feed = selected?.feed;
  return (
    <details className="cmd-provider-feed">
      <summary>
        Cloudflare public advisories
        {selected?.status === "ready" ? ` (${selected.items.length})` : ""}
      </summary>
      <p>
        Public notices require a reviewed dependency and local observations to
        establish relevance or impact. Notice severity, local relevance and
        confidence are separate.
      </p>
      <button
        type="button"
        disabled={paused}
        onClick={() => setEpoch((value) => value + 1)}
      >
        Refresh recorded advisories
      </button>
      {paused ? (
        <p role="status">
          Advisory reads paused. Resume to read the current recorded feed.
        </p>
      ) : !selected ? (
        <p role="status">Reading the complete recorded feed...</p>
      ) : selected.status === "unavailable" ? (
        <p role="alert">
          Recorded provider evidence is unavailable. No complete advisory
          population is established.
        </p>
      ) : (
        <>
          <p role="status">
            Feed {feed?.state ?? "unknown"}.{" "}
            {feed?.lastError
              ? `Source error: ${feed.lastError}. Retained notices are historical evidence. `
              : ""}
            Last successful fetch: {feed?.lastSuccessAt ?? "never"}. Last
            attempt: {feed?.lastAttemptAt ?? "never"}.
          </p>
          <p>
            Structured response read: {feed?.snapshot?.readAt ?? "not observed"}
            . Provider reported: {feed?.snapshot?.reportedAt ?? "not observed"}.
            These times do not replace notice update times.
          </p>
          <div className="cmd-provider-feed-filters">
            <label>
              Search advisories
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <label>
              Notice type
              <select
                value={kind}
                onChange={(event) => setKind(event.target.value)}
              >
                <option value="all">All types</option>
                <option value="incident">Incidents</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </label>
          </div>
          <p>
            {items.length} of {selected.items.length} recorded notices. No
            account topology is inferred from this public feed.
          </p>
          {items.length === 0 && (
            <p>
              {selected.items.length
                ? "No notices match the current filters."
                : feed?.state === "current"
                  ? "The complete current recorded collection contains no notices. Local monitoring coverage remains independent."
                  : "No notices are recorded. The source state does not establish an empty current incident feed."}
            </p>
          )}
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                <details>
                  <summary>{item.record.title}</summary>
                  <p>
                    {item.record.kind}; provider status {item.record.status};
                    severity {item.record.severity}.{" "}
                    {item.active ? "Recorded active" : "Retained or reconciled"}
                    . Local relevance: requires reviewed mapping. Confidence:
                    provider reported.
                  </p>
                  <p>
                    Created {item.record.createdAt}; updated{" "}
                    {item.record.updatedAt}; resolved{" "}
                    {item.record.resolvedAt ?? "not reported"}. Last seen{" "}
                    {item.lastSeenAt}; reconciled{" "}
                    {item.reconciledAt ?? "not reconciled"}.
                  </p>
                  {item.record.kind === "maintenance" && (
                    <p>
                      Maintenance window:{" "}
                      {item.record.scheduledFor ?? "not reported"} to{" "}
                      {item.record.scheduledUntil ?? "not reported"}.
                    </p>
                  )}
                  <p>
                    Components:{" "}
                    {item.record.componentIds.join(", ") || "not reported"}.
                  </p>
                  <a
                    href={item.record.evidenceHref}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Official notice {item.id}
                  </a>
                  {item.record.updates.map((update) => (
                    <article key={update.id}>
                      <strong>
                        {update.status} / {update.occurredAt}
                      </strong>
                      <p>{update.body}</p>
                    </article>
                  ))}
                </details>
              </li>
            ))}
          </ul>
          <details>
            <summary>
              Recorded provider components (
              {feed?.snapshot?.components.length ?? 0})
            </summary>
            <p>
              Stable component IDs for explicit dependency review. A name match
              does not establish a dependency.
            </p>
            <ul>
              {feed?.snapshot?.components.map((component) => (
                <li key={component.id}>
                  {component.name}: {component.id} / {component.status}
                  {component.groupId ? ` / group ${component.groupId}` : ""}
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </details>
  );
}
