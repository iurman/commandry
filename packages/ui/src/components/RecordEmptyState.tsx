export function RecordEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="cmd-empty-state">
      <span aria-hidden="true" className="cmd-empty-number">
        00
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
