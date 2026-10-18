import { describe, expect, it } from "vitest";
import {
  authorizeObservatoryQuery,
  defaultObservatoryPreferences,
  normalizeObservatorySectors,
  readObservatoryPreferences,
} from "./observatory-preferences";

describe("version two device-local Observatory preferences", () => {
  it("defaults to a still structural operational view without ambient movement", () => {
    expect(readObservatoryPreferences(null)).toMatchObject({
      version: 2,
      grouping: "operational",
      camera: "composed",
      size: "structural",
      ambient: false,
      lens: false,
      views: [],
    });
    const a = defaultObservatoryPreferences(),
      b = defaultObservatoryPreferences();
    a.colors.changed = "#123456";
    expect(b.colors).toEqual({});
  });
  it("remembers expand-all or collapse-all and defaults to every member", () => {
    expect(defaultObservatoryPreferences().reveal).toBe("members");
    const saved = { ...defaultObservatoryPreferences(), reveal: "groups" };
    expect(readObservatoryPreferences(JSON.stringify(saved)).reveal).toBe(
      "groups",
    );
    expect(
      readObservatoryPreferences(
        JSON.stringify({ ...saved, reveal: "everything" }),
      ).reveal,
    ).toBe("members");
  });
  it.each(["bad", "null", "[]", "42", '{"version":8}'])(
    "resets corrupt/unsupported data safely: %s",
    (value) => {
      expect(readObservatoryPreferences(value)).toEqual(
        defaultObservatoryPreferences(),
      );
    },
  );
  it("migrates v1 grouping, theme, palettes and exact custom membership without canonical writes", () => {
    const old = JSON.stringify({
      version: 1,
      grouping: "custom",
      theme: "midnight",
      ambient: true,
      assignments: { a: "Home", b: "Home", c: "Work" },
      colors: { reporting: "#123456", bad: "javascript:x" },
    });
    const result = readObservatoryPreferences(null, old);
    expect(result.grouping).toBe("custom");
    expect(result.theme).toBe("midnight");
    expect(result.colors).toEqual({ reporting: "#123456" });
    expect(
      result.sectors.map((sector) => [sector.label, sector.resourceIds]),
    ).toEqual([
      ["Home", ["a", "b"]],
      ["Work", ["c"]],
    ]);
    expect(result.ambient).toBe(false);
    expect(readObservatoryPreferences("broken-v2", old)).toEqual(
      defaultObservatoryPreferences(),
    );
  });
  it("round-trips deliberate presentation settings and scoped named local views", () => {
    const display = {
      ...defaultObservatoryPreferences(),
      theme: "midnight",
      palette: "earth",
      size: "total-ram",
      textScale: 1.5,
      tv: true,
      lens: true,
      reducedMotion: true,
      colors: { attention: "#cc8844" },
    };
    const saved = {
      ...display,
      views: [
        {
          id: "my-view",
          name: "Operations",
          scopeDigest: "authorized-scope",
          presentation: display,
          query: {
            grouping: "providers",
            environment: "production",
            expandedRepresentationIds: ["group:a"],
            search: "",
            sectors: [],
            viewRevision: "local:3",
          },
        },
      ],
    };
    const parsed = readObservatoryPreferences(JSON.stringify(saved));
    expect({ ...parsed, views: [] }).toMatchObject(display);
    expect(parsed.views[0]).toMatchObject({
      id: "my-view",
      scopeDigest: "authorized-scope",
      query: { grouping: "providers", environment: "production" },
    });
    expect(parsed.views[0]?.presentation).not.toHaveProperty("views");
  });
  it("filters invalid settings and prototype keys without truncating eligible sectors or members", () => {
    const members = Array.from(
      { length: 1200 },
      (_, index) => `resource:${index}`,
    );
    const sectors = normalizeObservatorySectors([
      {
        id: "all",
        label: "All authorized",
        grouping: "hosts",
        resourceIds: members,
      },
      { id: "__proto__", label: "Invalid", grouping: "hosts", resourceIds: [] },
      {
        id: "nested-custom",
        label: "Invalid",
        grouping: "custom",
        resourceIds: [],
      },
    ]);
    expect(sectors).toHaveLength(1);
    expect(sectors[0]?.resourceIds).toHaveLength(1200);
    const parsed = readObservatoryPreferences(
      '{"version":2,"textScale":200,"camera":"autoplay","colors":{"__proto__":"#123456","safe":"#102030"},"sectors":false,"views":[null]}',
    );
    expect(parsed.colors).toEqual({ safe: "#102030" });
    expect(parsed.textScale).toBe(1);
    expect(parsed.camera).toBe("composed");
    expect(parsed.sectors).toEqual([]);
    expect(parsed.views).toEqual([]);
  });
  it("revalidates expansions and sectors after permission loss without revealing private empty names", () => {
    const value = {
      grouping: "custom" as const,
      environment: null,
      expandedRepresentationIds: ["permitted", "hidden", "permitted"],
      reveal: "members" as const,
      search: "",
      sectors: [
        {
          id: "shared",
          label: "Shared",
          grouping: "hosts" as const,
          resourceIds: ["a", "hidden"],
        },
        {
          id: "secret",
          label: "Private sector label",
          grouping: "hosts" as const,
          resourceIds: ["hidden"],
        },
      ],
      viewRevision: "local:2",
    };
    const query = authorizeObservatoryQuery(value, {
      membershipIndex: { resourceIds: ["a"] },
      representations: [{ id: "permitted" }],
      viewRevision: "server:1",
    });
    expect(query.expandedRepresentationIds).toEqual(["permitted"]);
    expect(query.sectors).toEqual([
      { id: "shared", label: "Shared", grouping: "hosts", resourceIds: ["a"] },
    ]);
    expect(JSON.stringify(query)).not.toContain("Private sector label");
  });
});
