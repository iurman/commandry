import { Button } from "./Button";

export interface SavedViewOption {
  id: string;
  name: string;
}

export function SavedViewToolbar({
  surface,
  name,
  selectedId,
  options,
  busy,
  hasMore,
  onNameChange,
  onSelect,
  onCreate,
  onUpdate,
  onArchive,
  onLoadMore,
  error,
  notice,
}: {
  surface: "Work" | "Knowledge";
  name: string;
  selectedId: string;
  options: SavedViewOption[];
  busy: boolean;
  hasMore: boolean;
  onNameChange: (name: string) => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onUpdate: () => void;
  onArchive: () => void;
  onLoadMore: () => void;
  error: string | null;
  notice: string | null;
}) {
  return (
    <section
      className="cmd-workspace-section"
      aria-label={`${surface} saved views`}
    >
      <div className="cmd-section-heading">
        <div>
          <p className="cmd-eyebrow">Local saved query</p>
          <h2>Saved {surface} views</h2>
        </div>
        <span className="cmd-count">{options.length} shown</span>
      </div>
      <p className="cmd-section-intro">
        Save this screen&apos;s project and filters. Reopening a view queries
        current PostgreSQL records; it does not freeze a snapshot.
      </p>
      <div className="cmd-saved-view-controls">
        <label>
          Open a saved view
          <select
            value={selectedId}
            disabled={busy}
            onChange={(event) => onSelect(event.target.value)}
          >
            <option value="">Current unsaved query</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          View name
          <input
            type="text"
            maxLength={80}
            value={name}
            disabled={busy}
            onChange={(event) => onNameChange(event.target.value)}
          />
        </label>
      </div>
      <div className="cmd-workspace-filters">
        <Button disabled={busy || !name.trim()} onClick={onCreate}>
          Save as new view
        </Button>
        {selectedId && (
          <>
            <Button disabled={busy || !name.trim()} onClick={onUpdate}>
              Update saved view
            </Button>
            <Button disabled={busy} onClick={onArchive}>
              Remove saved view
            </Button>
            <a
              href={`/api/v1/saved-views/${encodeURIComponent(selectedId)}/audit`}
            >
              View change history
            </a>
          </>
        )}
        {hasMore && (
          <Button disabled={busy} onClick={onLoadMore}>
            Load more saved views
          </Button>
        )}
      </div>
      {error && (
        <p className="cmd-inline-state cmd-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="cmd-form-success" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
