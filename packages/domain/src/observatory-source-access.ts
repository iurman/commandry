import type { ObservatoryFacetAccess } from "./observatory";

/** A facet remains usable when at least one authorized source supports it. The
 * signal reducer independently retains every source's current failure/conflict. */
export function combineObservatorySourceAccess(
  rows: readonly ObservatoryFacetAccess[],
): ObservatoryFacetAccess[] {
  const precedence = [
    "available",
    "inaccessible",
    "unavailable",
    "disabled",
    "unsupported",
  ] as const;
  const groups = new Map<string, ObservatoryFacetAccess>();
  for (const row of rows) {
    const key = row.resourceId + ":" + row.facet;
    const previous = groups.get(key);
    if (
      !previous ||
      precedence.indexOf(row.state) < precedence.indexOf(previous.state)
    )
      groups.set(key, { ...row });
  }
  return [...groups.values()].sort(
    (a, b) =>
      a.resourceId.localeCompare(b.resourceId) ||
      a.facet.localeCompare(b.facet),
  );
}
