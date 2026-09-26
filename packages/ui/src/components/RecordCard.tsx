import type { ReactNode } from "react";

export interface RecordCardProps {
  id: string;
  name: string;
  kind: string;
  description?: string | null;
  href?: string;
  aside?: ReactNode;
  children?: ReactNode;
}

/** A canonical record in a list. Use one stable ID in every view of the record. */
export function RecordCard({
  id,
  name,
  kind,
  description,
  href,
  aside,
  children,
}: RecordCardProps) {
  return (
    <article className="cmd-record-card">
      <div className="cmd-record-topline">
        <span className="cmd-record-kind">{kind}</span>
        {aside}
      </div>
      <h3 className="cmd-record-title">
        {href ? <a href={href}>{name}</a> : name}
      </h3>
      {description && <p className="cmd-record-description">{description}</p>}
      <p className="cmd-record-identity" title={id}>
        <span>Record ID</span> <code>{id}</code>
      </p>
      {children}
    </article>
  );
}
