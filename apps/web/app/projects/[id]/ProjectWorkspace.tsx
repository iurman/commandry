"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  AppShell,
  Button,
  RecordEmptyState,
  RelationshipCard,
  StatusBadge,
} from "@commandry/ui";
import {
  apiJson,
  pagePath,
  type PageResponse,
  type ProjectRecord,
  type ProjectResourceLink,
  type ResourceRecord,
} from "../api";
import ProjectContent from "./ProjectContent";

type RelationshipType = "supports" | "relates_to";

function RelationshipTypeField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: RelationshipType;
  onChange: (value: RelationshipType) => void;
}) {
  return (
    <>
      <label htmlFor={id}>Relationship</label>
      <select
        id={id}
        onChange={(event) => onChange(event.target.value as RelationshipType)}
        value={value}
      >
        <option value="relates_to">Project relates to resource</option>
        <option value="supports">Resource supports project</option>
      </select>
      <p className="cmd-form-hint">
        The reverse meaning is shown beside each linked resource.
      </p>
    </>
  );
}

export default function ProjectWorkspace({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [links, setLinks] = useState<ProjectResourceLink[]>([]);
  const [nextLinkCursor, setNextLinkCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resourceName, setResourceName] = useState("");
  const [resourceKind, setResourceKind] = useState("service");
  const [resourceSubtype, setResourceSubtype] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [createType, setCreateType] = useState<RelationshipType>("relates_to");
  const [linkType, setLinkType] = useState<RelationshipType>("relates_to");
  const [showExisting, setShowExisting] = useState(false);
  const [resources, setResources] = useState<ResourceRecord[]>([]);
  const [nextResourceCursor, setNextResourceCursor] = useState<string | null>(
    null,
  );
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [resourcesError, setResourcesError] = useState<string | null>(null);
  const [selectedResourceId, setSelectedResourceId] = useState("");
  const relationPath = `/api/v1/projects/${encodeURIComponent(projectId)}/resources`;

  useEffect(() => {
    let active = true;
    Promise.all([
      apiJson<ProjectRecord>(
        `/api/v1/projects/${encodeURIComponent(projectId)}`,
      ),
      apiJson<PageResponse<ProjectResourceLink>>(pagePath(relationPath)),
    ])
      .then(([projectRecord, page]) => {
        if (!active) return;
        setProject(projectRecord);
        setLinks(page.items);
        setNextLinkCursor(page.nextCursor);
        setLoadError(null);
      })
      .catch((cause: unknown) => {
        if (active)
          setLoadError(
            cause instanceof Error ? cause.message : "Project is unavailable.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectId, relationPath]);

  useEffect(() => {
    if (!showExisting) return;
    let active = true;
    apiJson<PageResponse<ResourceRecord>>(pagePath("/api/v1/resources"))
      .then((page) => {
        if (!active) return;
        setResources(page.items);
        setNextResourceCursor(page.nextCursor);
        setResourcesError(null);
      })
      .catch((cause: unknown) => {
        if (active)
          setResourcesError(
            cause instanceof Error
              ? cause.message
              : "Resources are unavailable.",
          );
      })
      .finally(() => {
        if (active) setResourcesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [showExisting]);

  async function loadMoreLinks() {
    if (!nextLinkCursor || loadingMore) return;
    setLoadingMore(true);
    setLoadError(null);
    try {
      const page = await apiJson<PageResponse<ProjectResourceLink>>(
        pagePath(relationPath, nextLinkCursor),
      );
      setLinks((current) => [
        ...current,
        ...page.items.filter(
          (item) => !current.some((saved) => saved.id === item.id),
        ),
      ]);
      setNextLinkCursor(page.nextCursor);
    } catch (cause) {
      setLoadError(
        cause instanceof Error
          ? cause.message
          : "Could not load more resources.",
      );
    } finally {
      setLoadingMore(false);
    }
  }

  async function loadMoreResources() {
    if (!nextResourceCursor || resourcesLoading) return;
    setResourcesLoading(true);
    setResourcesError(null);
    try {
      const page = await apiJson<PageResponse<ResourceRecord>>(
        pagePath("/api/v1/resources", nextResourceCursor),
      );
      setResources((current) => [
        ...current,
        ...page.items.filter(
          (item) => !current.some((saved) => saved.id === item.id),
        ),
      ]);
      setNextResourceCursor(page.nextCursor);
    } catch (cause) {
      setResourcesError(
        cause instanceof Error
          ? cause.message
          : "Could not load more resources.",
      );
    } finally {
      setResourcesLoading(false);
    }
  }

  async function createResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resourceName.trim() || !resourceKind.trim() || submitting) return;
    setSubmitting(true);
    setFormError(null);
    setFeedback(null);
    let resource: ResourceRecord | null = null;
    try {
      resource = await apiJson<ResourceRecord>("/api/v1/resources", {
        method: "POST",
        body: JSON.stringify({
          kind: resourceKind.trim(),
          name: resourceName.trim(),
          ...(resourceSubtype.trim()
            ? { subtype: resourceSubtype.trim() }
            : {}),
          ...(externalUrl.trim() ? { externalUrl: externalUrl.trim() } : {}),
        }),
      });
      const link = await apiJson<ProjectResourceLink>(relationPath, {
        method: "POST",
        body: JSON.stringify({ resourceId: resource.id, type: createType }),
      });
      setLinks((current) => [link, ...current]);
      setResourceName("");
      setResourceSubtype("");
      setExternalUrl("");
      setFeedback(
        `Created and linked ${resource.name}. Operational health is unknown until observed.`,
      );
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "Could not create and link resource.";
      setFormError(
        resource
          ? `Resource ${resource.id} was created but could not be linked: ${message}. Use Link existing resource to retry.`
          : message,
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function linkExisting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedResourceId || submitting) return;
    setSubmitting(true);
    setFormError(null);
    setFeedback(null);
    try {
      const link = await apiJson<ProjectResourceLink>(relationPath, {
        method: "POST",
        body: JSON.stringify({
          resourceId: selectedResourceId,
          type: linkType,
        }),
      });
      setLinks((current) => [link, ...current]);
      const resource = resources.find((item) => item.id === selectedResourceId);
      setFeedback(
        `Linked ${resource?.name ?? "resource"} to this project. Its record ID is unchanged.`,
      );
      setSelectedResourceId("");
    } catch (cause) {
      setFormError(
        cause instanceof Error ? cause.message : "Could not link resource.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell current="Projects">
      <div className="cmd-breadcrumb">
        <a href="/projects">Projects</a>
        <span aria-hidden="true">/</span>
        <span>{project?.name ?? "Project"}</span>
      </div>
      {loading && (
        <p className="cmd-inline-state" role="status">
          Loading project...
        </p>
      )}
      {loadError && !project && (
        <p className="cmd-inline-state cmd-error" role="alert">
          {loadError}
        </p>
      )}
      {project && (
        <>
          <header className="cmd-page-header cmd-workspace-heading">
            <div>
              <p className="cmd-eyebrow">Workspace / {project.type}</p>
              <h1>{project.name}</h1>
              <p className="cmd-lead">
                {project.summary || "This project has no summary yet."}
              </p>
              <p className="cmd-record-identity cmd-heading-id">
                <span>Project ID</span> <code>{project.id}</code>
              </p>
            </div>
            <StatusBadge
              dimension="lifecycle"
              label={project.lifecycle}
              tone="neutral"
            />
          </header>

          <div className="cmd-workspace-grid">
            <section
              className="cmd-workspace-section"
              aria-labelledby="linked-resources-heading"
            >
              <div className="cmd-section-heading">
                <div>
                  <p className="cmd-eyebrow">Graph / Resources</p>
                  <h2 id="linked-resources-heading">Linked resources</h2>
                </div>
                <span className="cmd-count">{links.length} shown</span>
              </div>
              <p className="cmd-section-intro">
                Each edge states its meaning in both directions. A resource
                keeps the same record ID wherever it is linked.
              </p>
              {loadError && (
                <p className="cmd-inline-state cmd-error" role="alert">
                  {loadError}
                </p>
              )}
              {links.length === 0 && !loadError && (
                <RecordEmptyState
                  description="Create one here or link a resource that already exists."
                  title="No linked resources"
                />
              )}
              {links.length > 0 && (
                <ul className="cmd-record-list" aria-label="Linked resources">
                  {links.map((link) => (
                    <RelationshipCard key={link.id} {...link} />
                  ))}
                </ul>
              )}
              {nextLinkCursor && (
                <Button disabled={loadingMore} onClick={loadMoreLinks}>
                  {loadingMore ? "Loading..." : "Load more linked resources"}
                </Button>
              )}
            </section>

            <div className="cmd-workspace-side">
              <section
                className="cmd-workspace-section cmd-create-panel"
                aria-labelledby="create-resource-heading"
              >
                <p className="cmd-eyebrow">New record + edge</p>
                <h2 id="create-resource-heading">Create a resource</h2>
                <p className="cmd-form-intro">
                  Manual records have unknown operational health until a source
                  observes them.
                </p>
                <form className="cmd-form" onSubmit={createResource}>
                  <label htmlFor="resource-name">
                    Name <span aria-hidden="true">*</span>
                  </label>
                  <input
                    id="resource-name"
                    maxLength={160}
                    onChange={(event) => setResourceName(event.target.value)}
                    required
                    value={resourceName}
                  />
                  <label htmlFor="resource-kind">
                    Kind <span aria-hidden="true">*</span>
                  </label>
                  <input
                    id="resource-kind"
                    list="resource-kinds"
                    maxLength={80}
                    onChange={(event) => setResourceKind(event.target.value)}
                    required
                    value={resourceKind}
                  />
                  <datalist id="resource-kinds">
                    <option value="service" />
                    <option value="repository" />
                    <option value="server" />
                    <option value="domain" />
                    <option value="document" />
                    <option value="database" />
                  </datalist>
                  <label htmlFor="resource-subtype">
                    Subtype <span className="cmd-optional">Optional</span>
                  </label>
                  <input
                    id="resource-subtype"
                    maxLength={80}
                    onChange={(event) => setResourceSubtype(event.target.value)}
                    value={resourceSubtype}
                  />
                  <label htmlFor="resource-url">
                    Source URL <span className="cmd-optional">Optional</span>
                  </label>
                  <input
                    id="resource-url"
                    onChange={(event) => setExternalUrl(event.target.value)}
                    placeholder="https://"
                    type="url"
                    value={externalUrl}
                  />
                  <RelationshipTypeField
                    id="create-relationship-type"
                    onChange={setCreateType}
                    value={createType}
                  />
                  {formError && (
                    <p className="cmd-form-error" role="alert">
                      {formError}
                    </p>
                  )}
                  {feedback && (
                    <p className="cmd-form-success" role="status">
                      {feedback}
                    </p>
                  )}
                  <Button disabled={submitting} type="submit" variant="primary">
                    {submitting ? "Saving..." : "Create and link resource"}
                  </Button>
                </form>
              </section>

              <section
                className="cmd-workspace-section cmd-create-panel"
                aria-labelledby="link-resource-heading"
              >
                <p className="cmd-eyebrow">Existing record + new edge</p>
                <h2 id="link-resource-heading">Link existing resource</h2>
                <p className="cmd-form-intro">
                  Choose a record already in Commandry. Linking does not
                  duplicate it.
                </p>
                {!showExisting ? (
                  <Button
                    onClick={() => {
                      setResourcesLoading(true);
                      setShowExisting(true);
                    }}
                  >
                    Choose an existing resource
                  </Button>
                ) : (
                  <form className="cmd-form" onSubmit={linkExisting}>
                    {resourcesLoading && (
                      <p className="cmd-inline-state" role="status">
                        Loading resources...
                      </p>
                    )}
                    {resourcesError && (
                      <p className="cmd-form-error" role="alert">
                        {resourcesError}
                      </p>
                    )}
                    {!resourcesLoading &&
                      resources.length === 0 &&
                      !resourcesError && (
                        <p>No existing resources are available yet.</p>
                      )}
                    {resources.length > 0 && (
                      <>
                        <label htmlFor="existing-resource">Resource</label>
                        <select
                          id="existing-resource"
                          onChange={(event) =>
                            setSelectedResourceId(event.target.value)
                          }
                          required
                          value={selectedResourceId}
                        >
                          <option value="">Select a resource</option>
                          {resources.map((resource) => (
                            <option key={resource.id} value={resource.id}>
                              {resource.name} ({resource.kind}) · {resource.id}
                            </option>
                          ))}
                        </select>
                        <RelationshipTypeField
                          id="existing-relationship-type"
                          onChange={setLinkType}
                          value={linkType}
                        />
                      </>
                    )}
                    {nextResourceCursor && (
                      <Button
                        disabled={resourcesLoading}
                        onClick={loadMoreResources}
                      >
                        {resourcesLoading
                          ? "Loading..."
                          : "Load more resources"}
                      </Button>
                    )}
                    <Button
                      disabled={!selectedResourceId || submitting}
                      type="submit"
                      variant="primary"
                    >
                      {submitting ? "Linking..." : "Link resource"}
                    </Button>
                  </form>
                )}
              </section>
            </div>
          </div>
          <ProjectContent projectId={projectId} />
        </>
      )}
    </AppShell>
  );
}
