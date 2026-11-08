import { describe, expect, it } from "vitest";
import { emblemTicks } from "./emblem";
import {
  checkedResources,
  exampleCounts,
  layouts,
  lensRecords,
  lenses,
  records,
  relations,
  steps,
} from "./world";

const ids = new Set(records.map((record) => record.id));

describe("public site example world", () => {
  it("relates only authored records", () => {
    for (const relation of relations) {
      expect(ids.has(relation.from)).toBe(true);
      expect(ids.has(relation.to)).toBe(true);
    }
  });

  it("places every record in every layout", () => {
    for (const layout of Object.values(layouts)) {
      expect(Object.keys(layout.points).sort()).toEqual([...ids].sort());
    }
  });

  it("only animates relations that exist", () => {
    const edges = new Set(relations.map((relation) => relation.id));
    for (const step of steps) {
      for (const edge of step.edges) expect(edges.has(edge)).toBe(true);
      for (const packet of step.packets)
        expect(edges.has(packet.edge)).toBe(true);
      for (const id of [...step.focus, ...step.reveals])
        expect(ids.has(id)).toBe(true);
    }
  });

  it("derives displayed counts from the records", () => {
    expect(exampleCounts.records).toBe(records.length);
    expect(exampleCounts.relations).toBe(relations.length);
    expect(exampleCounts.resources).toBe(
      records.filter((r) => ["service", "host", "repository"].includes(r.kind))
        .length,
    );
    expect(exampleCounts.knowledge).toBe(
      records.filter((r) => ["capture", "runbook"].includes(r.kind)).length,
    );
    expect(exampleCounts.steps).toBe(steps.length);
  });

  it("gives every lens a position for every lens record", () => {
    for (const lens of lenses) {
      for (const id of lensRecords) expect(lens.positions[id]).toBeDefined();
      for (const id of lens.focus) expect(lensRecords).toContain(id);
    }
  });

  it("never sends a check to a resource without one", () => {
    const unknown = checkedResources.filter((r) => r.state === "unknown");
    expect(unknown.every((r) => r.reading === "No check configured")).toBe(
      true,
    );
  });

  it("orders the emblem ticks along the drawn stroke", () => {
    const delays = emblemTicks.map((tick) => tick.delayMs);
    expect([...delays].sort((a, b) => a - b)).toEqual(delays);
    expect(emblemTicks).toHaveLength(steps.length);
  });
});
