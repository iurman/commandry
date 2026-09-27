"use client";

import { useEffect, useState } from "react";
import type { SavedView, SavedViewDefinition } from "@commandry/contracts";
import { SavedViewToolbar } from "@commandry/ui";
import { apiJson, type PageResponse } from "../projects/api";

function savedViewsPath(surface: "work" | "knowledge", cursor?: string) {
  const params = new URLSearchParams({ surface, limit: "20" });
  if (cursor) params.set("cursor", cursor);
  return `/api/v1/saved-views?${params}`;
}

export default function SavedViewControls({
  definition,
  onApply,
}: {
  definition: SavedViewDefinition;
  onApply: (definition: SavedViewDefinition) => void;
}) {
  const [views, setViews] = useState<SavedView[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const surface = definition.surface;
  const selected = views.find((view) => view.id === selectedId);

  useEffect(() => {
    let active = true;
    apiJson<PageResponse<SavedView>>(savedViewsPath(surface))
      .then((page) => {
        if (!active) return;
        setViews(page.items);
        setNextCursor(page.nextCursor);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Saved views are unavailable.",
          );
      });
    return () => {
      active = false;
    };
  }, [surface]);

  async function loadMore() {
    if (!nextCursor || busy) return;
    setBusy(true);
    setError(null);
    try {
      const page = await apiJson<PageResponse<SavedView>>(
        savedViewsPath(surface, nextCursor),
      );
      setViews((current) => [
        ...current,
        ...page.items.filter(
          (view) => !current.some((saved) => saved.id === view.id),
        ),
      ]);
      setNextCursor(page.nextCursor);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load more views.",
      );
    } finally {
      setBusy(false);
    }
  }

  function select(id: string) {
    setSelectedId(id);
    setNotice(null);
    setError(null);
    const view = views.find((candidate) => candidate.id === id);
    if (view) {
      setName(view.name);
      onApply(view.definition);
    } else {
      setName("");
    }
  }

  async function create() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const created = await apiJson<SavedView>("/api/v1/saved-views", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), definition }),
      });
      setViews((current) => [created, ...current]);
      setSelectedId(created.id);
      setNotice("Saved locally. Reopening this view queries current records.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save view.");
    } finally {
      setBusy(false);
    }
  }

  async function update() {
    if (!selected || !name.trim() || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await apiJson<SavedView>(
        `/api/v1/saved-views/${encodeURIComponent(selected.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            expectedVersion: selected.version,
            name: name.trim(),
            definition,
          }),
        },
      );
      setViews((current) =>
        current.map((view) => (view.id === updated.id ? updated : view)),
      );
      setNotice("Saved view updated. Results remain current.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not update view.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await apiJson<SavedView>(
        `/api/v1/saved-views/${encodeURIComponent(selected.id)}/archive`,
        {
          method: "POST",
          body: JSON.stringify({ expectedVersion: selected.version }),
        },
      );
      setViews((current) => current.filter((view) => view.id !== selected.id));
      setSelectedId("");
      setName("");
      setNotice("Saved view removed. Its change history remains recorded.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not remove view.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <SavedViewToolbar
      surface={surface === "work" ? "Work" : "Knowledge"}
      name={name}
      selectedId={selectedId}
      options={views.map((view) => ({ id: view.id, name: view.name }))}
      busy={busy}
      hasMore={Boolean(nextCursor)}
      onNameChange={setName}
      onSelect={select}
      onCreate={create}
      onUpdate={update}
      onArchive={archive}
      onLoadMore={loadMore}
      error={error}
      notice={notice}
    />
  );
}
