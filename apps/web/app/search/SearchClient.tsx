"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { AppShell, Button, RecordEmptyState } from "@commandry/ui";
import {
  apiJson,
  pagePath,
  type PageResponse,
  type ProjectRecord,
} from "../projects/api";
import styles from "./search.module.css";

interface SearchResult {
  id: string;
  kind: "project" | "resource" | "capture" | "task" | "note";
  title: string;
  excerpt: string;
  href: string;
  projectId: string | null;
  sourceCaptureId: string | null;
  createdAt: string;
}

function searchPath(query: string, projectId: string, cursor?: string | null) {
  const params = new URLSearchParams({ q: query, limit: "20" });
  if (projectId) params.set("projectId", projectId);
  if (cursor) params.set("cursor", cursor);
  return `/api/v1/search?${params}`;
}

export default function SearchClient({
  initialQuery,
  initialProjectId,
}: {
  initialQuery: string;
  initialProjectId: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [projectId, setProjectId] = useState(initialProjectId);
  const [submitted, setSubmitted] = useState(Boolean(initialQuery.trim()));
  const [results, setResults] = useState<SearchResult[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [projectCursor, setProjectCursor] = useState<string | null>(null);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [loading, setLoading] = useState(Boolean(initialQuery.trim()));
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const requestNumber = useRef(0);
  const appliedSearch = useRef({
    query: initialQuery.trim(),
    projectId: initialProjectId,
  });

  useEffect(() => {
    let active = true;
    if (initialQuery.trim()) {
      void apiJson<PageResponse<SearchResult>>(
        searchPath(initialQuery.trim(), initialProjectId),
      )
        .then((page) => {
          if (!active || requestNumber.current !== 0) return;
          setResults(page.items);
          setNextCursor(page.nextCursor);
        })
        .catch((cause: unknown) => {
          if (!active || requestNumber.current !== 0) return;
          setError(
            cause instanceof Error ? cause.message : "Search is unavailable.",
          );
        })
        .finally(() => {
          if (active && requestNumber.current === 0) setLoading(false);
        });
    }
    void apiJson<PageResponse<ProjectRecord>>(pagePath("/api/v1/projects"))
      .then((page) => {
        if (!active) return;
        setProjects(page.items);
        setProjectCursor(page.nextCursor);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setProjectError(
          cause instanceof Error ? cause.message : "Projects are unavailable.",
        );
      })
      .finally(() => {
        if (active) setProjectsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [initialQuery, initialProjectId]);

  async function runSearch(nextQuery: string, nextProjectId: string) {
    const term = nextQuery.trim();
    const number = ++requestNumber.current;
    appliedSearch.current = { query: term, projectId: nextProjectId };
    setSubmitted(Boolean(term));
    setResults([]);
    setNextCursor(null);
    setError(null);
    if (!term) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const page = await apiJson<PageResponse<SearchResult>>(
        searchPath(term, nextProjectId),
      );
      if (number !== requestNumber.current) return;
      setResults(page.items);
      setNextCursor(page.nextCursor);
    } catch (cause) {
      if (number !== requestNumber.current) return;
      setError(
        cause instanceof Error ? cause.message : "Search is unavailable.",
      );
    } finally {
      if (number === requestNumber.current) setLoading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = query.trim();
    const params = new URLSearchParams();
    if (term) params.set("q", term);
    if (projectId) params.set("projectId", projectId);
    window.history.replaceState(
      null,
      "",
      `/search${params.size ? `?${params}` : ""}`,
    );
    void runSearch(term, projectId);
  }

  async function loadMoreResults() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await apiJson<PageResponse<SearchResult>>(
        searchPath(
          appliedSearch.current.query,
          appliedSearch.current.projectId,
          nextCursor,
        ),
      );
      setResults((items) => [...items, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load more results.",
      );
    } finally {
      setLoadingMore(false);
    }
  }

  async function loadMoreProjects() {
    if (!projectCursor || projectsLoading) return;
    setProjectsLoading(true);
    setProjectError(null);
    try {
      const page = await apiJson<PageResponse<ProjectRecord>>(
        pagePath("/api/v1/projects", projectCursor),
      );
      setProjects((items) => [...items, ...page.items]);
      setProjectCursor(page.nextCursor);
    } catch (cause) {
      setProjectError(
        cause instanceof Error ? cause.message : "Could not load projects.",
      );
    } finally {
      setProjectsLoading(false);
    }
  }

  return (
    <AppShell current="Search">
      <header className="cmd-page-header">
        <div>
          <p className="cmd-eyebrow">Find context</p>
          <h1>Search</h1>
          <p className="cmd-lead">
            Find projects, resources, captures, tasks, and notes stored in this
            local Commandry workspace. Results link to the underlying record.
          </p>
        </div>
      </header>
      <form className={styles.form} onSubmit={submit} role="search">
        <div className={styles.queryField}>
          <label htmlFor="search-query">Words to find</label>
          <input
            id="search-query"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects, resources, captures, tasks, and notes"
            required
            type="search"
            value={query}
          />
        </div>
        <div className={styles.projectField}>
          <label htmlFor="search-project">Project scope</label>
          <select
            id="search-project"
            onChange={(event) => setProjectId(event.target.value)}
            value={projectId}
          >
            <option value="">All projects</option>
            {projectId &&
              !projects.some((project) => project.id === projectId) && (
                <option value={projectId}>Selected project</option>
              )}
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
        <Button disabled={loading} type="submit" variant="primary">
          {loading ? "Searching..." : "Search records"}
        </Button>
      </form>
      {projectError && (
        <p className="cmd-inline-state cmd-error" role="alert">
          {projectError}
        </p>
      )}
      {projectCursor && (
        <Button disabled={projectsLoading} onClick={loadMoreProjects}>
          {projectsLoading ? "Loading..." : "Load more projects"}
        </Button>
      )}
      <section
        aria-labelledby="search-results-heading"
        className={styles.results}
      >
        <div className="cmd-section-heading">
          <div>
            <p className="cmd-eyebrow">Evidence in context</p>
            <h2 id="search-results-heading">Results</h2>
          </div>
          {submitted && (
            <span className="cmd-count">{results.length} shown</span>
          )}
        </div>
        {loading && (
          <p className="cmd-inline-state" role="status">
            Searching records...
          </p>
        )}
        {error && (
          <p className="cmd-inline-state cmd-error" role="alert">
            {error}
          </p>
        )}
        {!submitted && !loading && (
          <RecordEmptyState
            title="Ready to search"
            description="Enter a word or phrase to find persisted local records."
          />
        )}
        {submitted && !loading && results.length === 0 && !error && (
          <RecordEmptyState
            title="No matching records"
            description="Try another phrase or search across all projects."
          />
        )}
        {results.length > 0 && (
          <ul className={styles.list} aria-label="Search results">
            {results.map((result) => (
              <li className={styles.result} key={`${result.kind}:${result.id}`}>
                <div className={styles.resultMeta}>
                  <span>{result.kind}</span>
                  <time dateTime={result.createdAt}>
                    {new Date(result.createdAt).toLocaleDateString()}
                  </time>
                </div>
                <h3>
                  <a href={result.href}>{result.title}</a>
                </h3>
                {result.excerpt && <p>{result.excerpt}</p>}
                {result.sourceCaptureId && result.kind !== "capture" && (
                  <a
                    className={styles.sourceLink}
                    href={`/inbox?captureId=${encodeURIComponent(result.sourceCaptureId)}`}
                  >
                    View original capture
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
        {nextCursor && (
          <Button disabled={loadingMore} onClick={loadMoreResults}>
            {loadingMore ? "Loading..." : "Load more results"}
          </Button>
        )}
      </section>
    </AppShell>
  );
}
