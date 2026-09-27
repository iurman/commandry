export interface AutomationEvidenceCheckView {
  id: string;
  status: "complete" | "missing";
  evidenceCount: number;
  missing: Array<{ kind: string; id: string }>;
  checkedAt: string;
}

export function AutomationEvidenceCheckCard({
  check,
}: {
  check: AutomationEvidenceCheckView;
}) {
  return (
    <article
      className="cmd-source-freshness"
      aria-label="Local automation evidence check"
    >
      <strong>
        {check.status === "complete"
          ? "All referenced local records present"
          : "Some referenced local records are missing"}
      </strong>
      <p>
        {check.evidenceCount} references checked at{" "}
        <time dateTime={check.checkedAt}>
          {new Date(check.checkedAt).toLocaleString()}
        </time>
        .
      </p>
      {check.missing.length > 0 && (
        <ul>
          {check.missing.map((item) => (
            <li key={`${item.kind}:${item.id}`}>
              {item.kind}: <code>{item.id}</code>
            </li>
          ))}
        </ul>
      )}
      <p>
        This checks reference presence only. The synthetic result remains
        unverified; no external effect was checked.
      </p>
    </article>
  );
}
