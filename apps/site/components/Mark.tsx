// The approved Commandry mark: one open stroke ending in two nodes. Geometry
// is unchanged from apps/web/public/icon.svg; only the tile is optional here.
export function Mark({
  size = 28,
  tile = true,
  className,
}: {
  size?: number;
  tile?: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {tile ? (
        <rect width="512" height="512" rx="108" className="mark-tile" />
      ) : null}
      <path
        d="M352 150H240c-59 0-104 45-104 106s45 106 104 106h112"
        fill="none"
        strokeWidth="58"
        strokeLinecap="round"
        className="mark-stroke"
      />
      <circle cx="354" cy="150" r="33" className="mark-node" />
      <circle cx="354" cy="362" r="33" className="mark-node" />
    </svg>
  );
}
