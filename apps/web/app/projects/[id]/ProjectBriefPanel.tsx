"use client";

import { useEffect, useState } from "react";
import {
  projectBriefSchema,
  type ProjectBrief as ProjectBriefRecord,
} from "@commandry/contracts";
import { Button, ProjectBrief } from "@commandry/ui";
import { apiJson } from "../api";

export default function ProjectBriefPanel({
  projectId,
}: {
  projectId: string;
}) {
  const [brief, setBrief] = useState<ProjectBriefRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    apiJson<unknown>(`/api/v1/projects/${encodeURIComponent(projectId)}/brief`)
      .then((record) => {
        if (!active) return;
        const parsed = projectBriefSchema.safeParse(record);
        if (!parsed.success)
          throw new Error("Project brief response is invalid.");
        setBrief(parsed.data as ProjectBriefRecord);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Project brief is unavailable.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectId, revision]);

  function refresh() {
    setLoading(true);
    setError(null);
    setRevision((current) => current + 1);
  }

  const projectHref = `/projects/${encodeURIComponent(projectId)}`;
  return (
    <section className="cmd-brief-panel" aria-label="Project brief panel">
      {loading && (
        <p className="cmd-inline-state" role="status">
          Generating project brief...
        </p>
      )}
      {error && (
        <div className="cmd-brief-error">
          <p className="cmd-inline-state cmd-error" role="alert">
            {error}
          </p>
          <Button onClick={refresh}>Retry project brief</Button>
        </div>
      )}
      {brief && !loading && !error && (
        <>
          <ProjectBrief
            brief={brief}
            sectionHrefs={{
              work: `${projectHref}#work-heading`,
              knowledge: `${projectHref}#knowledge-heading`,
              decisions: `${projectHref}#decisions-heading`,
              resources: `${projectHref}#linked-resources-heading`,
              activity: `/activity?projectId=${encodeURIComponent(projectId)}`,
              attention: `/activity?projectId=${encodeURIComponent(projectId)}#attention`,
            }}
          />
          <Button className="cmd-brief-refresh" onClick={refresh}>
            Refresh project brief
          </Button>
        </>
      )}
    </section>
  );
}
