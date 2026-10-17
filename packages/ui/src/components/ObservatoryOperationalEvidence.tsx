"use client";

import { useEffect, useRef, useState } from "react";
import {
  observatoryOperationalEvidenceResultSchema,
  type ObservatoryOperationalEvidenceResult,
} from "@commandry/contracts";

type Facet = ObservatoryOperationalEvidenceResult["facet"];
export type ObservatoryEvidenceClient = (
  resourceId: string,
  facet: Facet,
) => Promise<unknown>;

/** Literal, derived evidence only. Original payloads and credentials stay server-side. */
export function ObservatoryOperationalEvidence({
  resourceId,
  scopeKey,
  readRevision = "",
  repository,
  loadEvidence,
}: {
  resourceId: string;
  scopeKey: string;
  readRevision?: string;
  repository: boolean;
  loadEvidence: ObservatoryEvidenceClient;
}) {
  const [facet, setFacet] = useState<Facet>(
    repository ? "pull_requests" : "availability",
  );
  const [loaded, setLoaded] = useState<{
    key: string;
    value: ObservatoryOperationalEvidenceResult;
  } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const requestKey = JSON.stringify([
    resourceId,
    scopeKey,
    readRevision,
    facet,
    attempt,
  ]);
  const result = loaded?.key === requestKey ? loaded.value : null;
  const failed = failedKey === requestKey;
  useEffect(() => {
    const ticket = ++generation.current;
    void loadEvidence(resourceId, facet)
      .then((raw) => {
        const parsed = observatoryOperationalEvidenceResultSchema.parse(raw);
        if (parsed.resourceId !== resourceId || parsed.facet !== facet)
          throw new Error("Evidence subject changed");
        if (generation.current === ticket)
          setLoaded({ key: requestKey, value: parsed });
      })
      .catch(() => {
        if (generation.current === ticket) setFailedKey(requestKey);
      });
    return () => {
      generation.current = ticket + 1;
    };
  }, [resourceId, facet, loadEvidence, requestKey]);
  return (
    <section
      aria-label="Operational source details"
      className="cmd-op-source-details"
    >
      <h4>Operational evidence</h4>
      <label>
        Evidence facet{" "}
        <select
          value={facet}
          onChange={(event) => setFacet(event.target.value as Facet)}
        >
          <option value="availability">Availability checks</option>
          <option value="pull_requests">Repository pull requests</option>
          <option value="security">Repository security</option>
        </select>
      </label>
      {failed ? (
        <p role="status">
          Evidence unavailable.{" "}
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry evidence
          </button>
        </p>
      ) : !result ? (
        <p role="status">Reading authorized evidence...</p>
      ) : (
        <>
          <p>
            {result.access.replaceAll("_", " ")} / {result.items.length}{" "}
            reviewed sources
          </p>
          {result.access === "unsupported" && (
            <p>
              No supported source is configured for this facet. Coverage remains
              unknown.
            </p>
          )}
          {result.items.map((item) => (
            <details key={item.sourceId}>
              <summary>
                {item.kind === "infraagent-monitor"
                  ? "Availability monitor"
                  : item.kind === "http-readiness"
                    ? "Commandry readiness check"
                    : "Repository source"}{" "}
                / {item.enabled ? "enabled" : "disabled"} / {item.freshness}
              </summary>
              <p>
                Source <code>{item.sourceId}</code>. Environment:{" "}
                {item.environment ?? "unknown"}.
              </p>
              <p>
                {item.observedAt ? (
                  <>
                    Evidence time:{" "}
                    <time dateTime={item.observedAt}>{item.observedAt}</time>.
                  </>
                ) : (
                  "No observation time is recorded."
                )}
              </p>
              {item.lastError && (
                <p>
                  Latest source attempt failed: {item.lastError}. Retained
                  evidence does not establish current coverage.
                </p>
              )}
              {item.payload === null && (
                <p>No supported observation has been recorded.</p>
              )}
            </details>
          ))}
          {result.facet === "availability" &&
            result.items.map(
              (item) =>
                item.payload && (
                  <div key={item.sourceId}>
                    <h5>
                      {item.kind === "http-readiness"
                        ? "Readiness check"
                        : "Monitor"}{" "}
                      {item.payload.monitorId}
                    </h5>
                    <p>
                      Source: {item.payload.sourceState}. Reason:{" "}
                      {item.payload.reason.replaceAll("_", " ")}. Source reports{" "}
                      {item.payload.monitorStatus}.
                    </p>
                    {item.payload.latestCheck && (
                      <p>
                        Last check: {item.payload.latestCheck.status},{" "}
                        {item.payload.latestCheck.checkedAt};{" "}
                        {item.payload.latestCheck.responseTimeMs ?? "unknown"}{" "}
                        ms; HTTP{" "}
                        {item.payload.latestCheck.statusCode ?? "unknown"}.
                      </p>
                    )}
                    {item.payload.openIncident && (
                      <p>
                        Open incident {item.payload.openIncident.id}, started{" "}
                        {item.payload.openIncident.startedAt}.{" "}
                        {item.payload.openIncident.acknowledgedAt
                          ? "Acknowledged; recovery is not established by acknowledgment."
                          : "Unacknowledged."}
                      </p>
                    )}
                    <p>
                      {item.kind === "http-readiness"
                        ? "One direct web/database readiness probe. This does not establish external user availability or complete uptime history."
                        : "Recent checks are limited to the latest 25 from this source. This is not complete uptime history."}
                    </p>
                  </div>
                ),
            )}
          {result.facet === "pull_requests" &&
            result.items.map(
              (item) =>
                item.payload && (
                  <details key={item.sourceId} open>
                    <summary>
                      {item.payload.repository.owner}/
                      {item.payload.repository.name}:{" "}
                      {item.payload.pullRequests.state.replaceAll("_", " ")}
                    </summary>
                    <p>
                      {item.payload.pullRequests.state === "available"
                        ? `${item.payload.pullRequests.items.length} open pull requests in the complete source read.`
                        : "Pull request coverage is unavailable."}{" "}
                      Pull requests do not establish an active coding run.
                    </p>
                    <ul>
                      {item.payload.pullRequests.items.map((pull) => (
                        <li key={pull.id}>
                          <a href={pull.url} target="_blank" rel="noreferrer">
                            #{pull.number} {pull.title}
                          </a>
                          {pull.draft ? " (draft)" : ""}
                          <span>
                            {" "}
                            / {pull.baseRef} / updated {pull.updatedAt}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ),
            )}
          {result.facet === "security" &&
            result.items.map(
              (item) =>
                item.payload && (
                  <details key={item.sourceId} open>
                    <summary>
                      {item.payload.repository.owner}/
                      {item.payload.repository.name}: scanner evidence
                    </summary>
                    <p>
                      Current HEAD scan coverage: unknown. Zero observed
                      findings does not establish that a repository is
                      uncompromised.
                    </p>
                    <p>
                      Code analyses:{" "}
                      {item.payload.security.codeScanning.analyses.state.replaceAll(
                        "_",
                        " ",
                      )}
                      .
                    </p>
                    <ul>
                      {item.payload.security.codeScanning.analyses.items.map(
                        (analysis) => (
                          <li key={analysis.id}>
                            <a
                              href={analysis.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {analysis.tool.name}
                            </a>{" "}
                            / {analysis.ref} / {analysis.commitSha} /{" "}
                            {analysis.outcome} / {analysis.freshness} /{" "}
                            {analysis.createdAt}
                            {analysis.hasWarnings ? " / warnings reported" : ""}
                          </li>
                        ),
                      )}
                    </ul>
                    {(
                      [
                        [
                          "Code alerts",
                          item.payload.security.codeScanning.alerts,
                        ],
                        ["Dependency alerts", item.payload.security.dependabot],
                        ["Secret alerts", item.payload.security.secretScanning],
                      ] as const
                    ).map(([label, component]) => (
                      <details key={label}>
                        <summary>
                          {label}:{" "}
                          {component.state === "available"
                            ? `${component.items.length} observed open alerts`
                            : component.state.replaceAll("_", " ")}
                        </summary>
                        {component.errorCode && (
                          <p>
                            {component.errorCode}. No complete result is
                            available.
                          </p>
                        )}
                        <ul>
                          {component.items.map((alert) => (
                            <li key={alert.number}>
                              <a
                                href={alert.url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Alert #{alert.number}
                              </a>{" "}
                              / {alert.severity} /{" "}
                              {alert.rule ?? "rule unavailable"} /{" "}
                              {alert.ref ?? "reference unknown"} /{" "}
                              {alert.updatedAt ?? alert.createdAt}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ))}
                  </details>
                ),
            )}
        </>
      )}
    </section>
  );
}
