import { expect, it } from "vitest";
import { combineObservatorySourceAccess } from "./observatory-source-access";
import type { ObservatoryAccess } from "./observatory";
it.each([
  [["available", "available"], "available"],
  [["available", "unavailable"], "available"],
  [["disabled", "available"], "available"],
  [["disabled", "disabled"], "disabled"],
  [["unavailable", "unavailable"], "unavailable"],
  [["unsupported", "inaccessible"], "inaccessible"],
] as [ObservatoryAccess[], ObservatoryAccess][])(
  "combines source states %s as %s without duplicate facet rows",
  (states, expected) => {
    const rows = states.map((state) => ({
      resourceId: "resource",
      facet: "availability" as const,
      state,
    }));
    expect(combineObservatorySourceAccess(rows)).toEqual([
      { resourceId: "resource", facet: "availability", state: expected },
    ]);
    expect(combineObservatorySourceAccess([...rows].reverse())).toEqual(
      combineObservatorySourceAccess(rows),
    );
  },
);
it("keeps distinct resources and facets separate", () => {
  expect(
    combineObservatorySourceAccess([
      { resourceId: "a", facet: "availability", state: "available" },
      { resourceId: "a", facet: "security", state: "unsupported" },
      { resourceId: "b", facet: "availability", state: "disabled" },
    ]),
  ).toHaveLength(3);
});
