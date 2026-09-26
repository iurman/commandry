"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@commandry/ui";
import {
  apiJson,
  pagePath,
  type PageResponse,
  type ResourceRecord,
} from "../../projects/api";

interface DependencyRecord {
  id: string;
  type: "depends_on";
  inverseType: "required_by";
  direction: "outgoing" | "incoming";
  resource: ResourceRecord;
  createdAt: string;
}

function message(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}

function dependencyPath(
  resourceId: string,
  direction: "outgoing" | "incoming",
  cursor?: string | null,
) {
  const query = new URLSearchParams({ direction, limit: "20" });
  if (cursor) query.set("cursor", cursor);
  return `/api/v1/resources/${encodeURIComponent(resourceId)}/dependencies?${query}`;
}

export default function ResourceTopologyPanel({
  resource,
  onResourceChange,
}: {
  resource: ResourceRecord;
  onResourceChange: (resource: ResourceRecord) => void;
}) {
  const [initialParentResourceId] = useState(resource.parentResourceId);
  const [choices, setChoices] = useState<ResourceRecord[]>([]);
  const [choicesCursor, setChoicesCursor] = useState<string | null>(null);
  const [choicesLoading, setChoicesLoading] = useState(true);
  const [choicesMoreLoading, setChoicesMoreLoading] = useState(false);
  const [choicesError, setChoicesError] = useState<string | null>(null);
  const [parentChoice, setParentChoice] = useState(
    resource.parentResourceId ?? "",
  );
  const [parentSaving, setParentSaving] = useState(false);
  const [parentError, setParentError] = useState<string | null>(null);
  const [parentFeedback, setParentFeedback] = useState<string | null>(null);
  const [dependencyChoice, setDependencyChoice] = useState("");
  const [dependencySaving, setDependencySaving] = useState(false);
  const [dependencyError, setDependencyError] = useState<string | null>(null);
  const [dependencyFeedback, setDependencyFeedback] = useState<string | null>(
    null,
  );
  const [outgoing, setOutgoing] = useState<DependencyRecord[]>([]);
  const [incoming, setIncoming] = useState<DependencyRecord[]>([]);
  const [outgoingCursor, setOutgoingCursor] = useState<string | null>(null);
  const [incomingCursor, setIncomingCursor] = useState<string | null>(null);
  const [linksLoading, setLinksLoading] = useState(true);
  const [linksMoreLoading, setLinksMoreLoading] = useState<
    "outgoing" | "incoming" | null
  >(null);
  const [linksError, setLinksError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiJson<PageResponse<ResourceRecord>>(pagePath("/api/v1/resources"))
      .then(async (page) => {
        if (!active) return;
        let items = page.items;
        if (
          initialParentResourceId &&
          !items.some((item) => item.id === initialParentResourceId)
        ) {
          const parent = await apiJson<ResourceRecord>(
            `/api/v1/resources/${encodeURIComponent(initialParentResourceId)}`,
          );
          items = [parent, ...items];
        }
        if (!active) return;
        setChoices(items);
        setChoicesCursor(page.nextCursor);
        setChoicesError(null);
      })
      .catch((cause: unknown) => {
        if (active)
          setChoicesError(message(cause, "Resource choices are unavailable."));
      })
      .finally(() => {
        if (active) setChoicesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [resource.id, initialParentResourceId]);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiJson<PageResponse<DependencyRecord>>(
        dependencyPath(resource.id, "outgoing"),
      ),
      apiJson<PageResponse<DependencyRecord>>(
        dependencyPath(resource.id, "incoming"),
      ),
    ])
      .then(([outgoingPage, incomingPage]) => {
        if (!active) return;
        setOutgoing(outgoingPage.items);
        setOutgoingCursor(outgoingPage.nextCursor);
        setIncoming(incomingPage.items);
        setIncomingCursor(incomingPage.nextCursor);
        setLinksError(null);
      })
      .catch((cause: unknown) => {
        if (active)
          setLinksError(message(cause, "Resource links are unavailable."));
      })
      .finally(() => {
        if (active) setLinksLoading(false);
      });
    return () => {
      active = false;
    };
  }, [resource.id]);

  async function loadMoreChoices() {
    if (!choicesCursor || choicesMoreLoading) return;
    setChoicesMoreLoading(true);
    setChoicesError(null);
    try {
      const page = await apiJson<PageResponse<ResourceRecord>>(
        pagePath("/api/v1/resources", choicesCursor),
      );
      setChoices((current) => [
        ...current,
        ...page.items.filter(
          (item) => !current.some((saved) => saved.id === item.id),
        ),
      ]);
      setChoicesCursor(page.nextCursor);
    } catch (cause) {
      setChoicesError(message(cause, "Could not load more resource choices."));
    } finally {
      setChoicesMoreLoading(false);
    }
  }

  async function saveParent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (parentSaving || parentChoice === resource.id) return;
    setParentSaving(true);
    setParentError(null);
    setParentFeedback(null);
    try {
      const updated = await apiJson<ResourceRecord>(
        `/api/v1/resources/${encodeURIComponent(resource.id)}/parent`,
        {
          method: "PUT",
          body: JSON.stringify({
            parentResourceId: parentChoice || null,
            expectedParentResourceId: resource.parentResourceId,
          }),
        },
      );
      onResourceChange(updated);
      setParentChoice(updated.parentResourceId ?? "");
      setParentFeedback(
        updated.parentResourceId
          ? "Primary parent updated. Dependency links remain separate."
          : "Resource moved to the root of the hierarchy.",
      );
    } catch (cause) {
      setParentError(message(cause, "Could not change primary parent."));
    } finally {
      setParentSaving(false);
    }
  }

  async function addDependency(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dependencyChoice || dependencySaving) return;
    setDependencySaving(true);
    setDependencyError(null);
    setDependencyFeedback(null);
    try {
      const linked = await apiJson<DependencyRecord>(
        `/api/v1/resources/${encodeURIComponent(resource.id)}/dependencies`,
        {
          method: "POST",
          body: JSON.stringify({ requiredResourceId: dependencyChoice }),
        },
      );
      setOutgoing((current) => [linked, ...current]);
      setDependencyChoice("");
      setDependencyFeedback(
        "Dependency recorded without changing containment.",
      );
      try {
        const page = await apiJson<PageResponse<DependencyRecord>>(
          dependencyPath(resource.id, "outgoing"),
        );
        setOutgoing(page.items);
        setOutgoingCursor(page.nextCursor);
        setLinksError(null);
      } catch (cause) {
        setLinksError(
          message(cause, "Dependency saved, but its list could not refresh."),
        );
      }
    } catch (cause) {
      setDependencyError(message(cause, "Could not add dependency."));
    } finally {
      setDependencySaving(false);
    }
  }

  async function loadMoreLinks(direction: "outgoing" | "incoming") {
    const cursor = direction === "outgoing" ? outgoingCursor : incomingCursor;
    if (!cursor || linksMoreLoading) return;
    setLinksMoreLoading(direction);
    setLinksError(null);
    try {
      const page = await apiJson<PageResponse<DependencyRecord>>(
        dependencyPath(resource.id, direction, cursor),
      );
      if (direction === "outgoing") {
        setOutgoing((current) => [
          ...current,
          ...page.items.filter(
            (item) => !current.some((saved) => saved.id === item.id),
          ),
        ]);
        setOutgoingCursor(page.nextCursor);
      } else {
        setIncoming((current) => [
          ...current,
          ...page.items.filter(
            (item) => !current.some((saved) => saved.id === item.id),
          ),
        ]);
        setIncomingCursor(page.nextCursor);
      }
    } catch (cause) {
      setLinksError(message(cause, "Could not load more resource links."));
    } finally {
      setLinksMoreLoading(null);
    }
  }

  const selectedParent = choices.find(
    (item) => item.id === resource.parentResourceId,
  );

  return (
    <section
      className="cmd-workspace-section"
      aria-labelledby="resource-topology-heading"
    >
      <p className="cmd-eyebrow">Containment / Dependencies</p>
      <h2 id="resource-topology-heading">Resource relationships</h2>
      <p>
        Primary parent:{" "}
        {resource.parentResourceId ? (
          <a href={`/resources/${resource.parentResourceId}`}>
            {selectedParent?.name ?? resource.parentResourceId}
          </a>
        ) : (
          "Root resource"
        )}
        . A resource has one primary parent but can have many dependency and
        project links.
      </p>
      <div className="cmd-resource-topology-forms">
        <form className="cmd-form" onSubmit={saveParent}>
          <h3>Primary parent</h3>
          <label htmlFor="resource-parent-choice">Contained by</label>
          <select
            disabled={choicesLoading}
            id="resource-parent-choice"
            onChange={(event) => setParentChoice(event.target.value)}
            value={parentChoice}
          >
            <option value="">Root resource</option>
            {choices
              .filter((item) => item.id !== resource.id)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.kind})
                </option>
              ))}
          </select>
          <Button
            disabled={
              parentSaving || choicesLoading || parentChoice === resource.id
            }
            type="submit"
          >
            {parentSaving ? "Saving parent..." : "Save primary parent"}
          </Button>
          {parentError && (
            <p className="cmd-form-error" role="alert">
              {parentError}
            </p>
          )}
          {parentFeedback && (
            <p className="cmd-form-success" role="status">
              {parentFeedback}
            </p>
          )}
        </form>
        <form className="cmd-form" onSubmit={addDependency}>
          <h3>Dependency</h3>
          <label htmlFor="resource-dependency-choice">Depends on</label>
          <select
            disabled={choicesLoading}
            id="resource-dependency-choice"
            onChange={(event) => setDependencyChoice(event.target.value)}
            value={dependencyChoice}
          >
            <option value="">Choose a resource</option>
            {choices
              .filter((item) => item.id !== resource.id)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.kind})
                </option>
              ))}
          </select>
          <Button
            disabled={dependencySaving || !dependencyChoice}
            type="submit"
          >
            {dependencySaving ? "Adding dependency..." : "Add dependency"}
          </Button>
          {dependencyError && (
            <p className="cmd-form-error" role="alert">
              {dependencyError}
            </p>
          )}
          {dependencyFeedback && (
            <p className="cmd-form-success" role="status">
              {dependencyFeedback}
            </p>
          )}
        </form>
      </div>
      {choicesError && (
        <p className="cmd-form-error" role="alert">
          {choicesError}
        </p>
      )}
      {choicesCursor && (
        <Button
          disabled={choicesMoreLoading}
          onClick={loadMoreChoices}
          type="button"
        >
          {choicesMoreLoading ? "Loading..." : "Load more resource choices"}
        </Button>
      )}
      <div className="cmd-resource-topology-links">
        <div>
          <h3>Depends on</h3>
          {!linksLoading && outgoing.length === 0 && (
            <p>No dependencies recorded.</p>
          )}
          <ul aria-label="Resource dependencies">
            {outgoing.map((link) => (
              <li key={link.id}>
                <a href={`/resources/${link.resource.id}`}>
                  {link.resource.name}
                </a>
                <span>depends_on / manual</span>
              </li>
            ))}
          </ul>
          {outgoingCursor && (
            <Button
              disabled={Boolean(linksMoreLoading)}
              onClick={() => loadMoreLinks("outgoing")}
              type="button"
            >
              Load more dependencies
            </Button>
          )}
        </div>
        <div>
          <h3>Required by</h3>
          {!linksLoading && incoming.length === 0 && (
            <p>No dependents recorded.</p>
          )}
          <ul aria-label="Resource dependents">
            {incoming.map((link) => (
              <li key={link.id}>
                <a href={`/resources/${link.resource.id}`}>
                  {link.resource.name}
                </a>
                <span>required_by / manual</span>
              </li>
            ))}
          </ul>
          {incomingCursor && (
            <Button
              disabled={Boolean(linksMoreLoading)}
              onClick={() => loadMoreLinks("incoming")}
              type="button"
            >
              Load more dependents
            </Button>
          )}
        </div>
      </div>
      {linksLoading && <p role="status">Loading relationships...</p>}
      {linksError && (
        <p className="cmd-form-error" role="alert">
          {linksError}
        </p>
      )}
    </section>
  );
}
