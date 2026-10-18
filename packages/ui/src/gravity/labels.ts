import { basinField, floorSwell, surfaceHeight } from "./model";
import type { Well } from "./model";

export type LabelPosition = {
  id: string;
  x: number;
  y: number;
  visible: boolean;
  opacity: number;
  attention?: boolean;
  /** Structural admission priority: groups before the members they contain. */
  rank?: number;
  /** Farthest collision offset, in CSS pixels, that still names this subject. */
  leash?: number;
  /** Placed by its caller (a callout column): the layout keeps its position
   * and opacity exactly, and other labels yield to it. */
  fixed?: boolean;
};
export type LabelRect = { x: number; y: number; width: number; height: number };
type State = {
  x: number;
  y: number;
  opacity: number;
  admitted: boolean;
  /** Seconds the label has wanted the opposite admission. */
  pending: number;
  /** Released before: it waits for room to persist before returning. */
  returning: boolean;
};
/** A visible label that loses its room keeps its place this long before
 * fading out, and once released needs room this long before it returns.
 * Brief contacts while the camera moves therefore never blink a name off and
 * on. A label whose subject leaves view fades at once. */
export const LABEL_RELEASE = 0.3;
export const LABEL_ADMIT = 0.2;
type Separation = { axis: "x" | "y"; direction: number };

// Labels belong to the structural crest, not the animated floor or a neighbour.
// The resource's own basin calms the floor swell without lowering its label.
export function labelHeight(well: Well, parent?: Well) {
  const context = basinField(well.x, well.z, parent ? [parent] : []);
  const own = basinField(well.x, well.z, [well]);
  return (
    floorSwell(well.x, well.z) * Math.exp(-(context.calm + own.calm)) +
    context.height +
    well.elevation +
    well.radius * 0.13 +
    0.8
  );
}

/** An open pool is named on its far rim so it never covers the members it names. */
export function poolLabelPoint(
  well: Well,
  forward: { x: number; z: number },
): { x: number; y: number; z: number } {
  const length = Math.hypot(forward.x, forward.z) || 1;
  const x = well.x + (forward.x / length) * well.radius * well.aspect * 0.98,
    z = well.z + (forward.z / length) * well.radius * 0.98;
  return { x, y: surfaceHeight(x, z, [well]) + 0.6, z };
}

export class LabelLayout {
  private states = new Map<string, State>();
  private separations = new Map<string, Separation>();
  private sizes = new Map<string, { width: number; height: number }>();
  private targetInput: string | null = null;
  private targets = new Map<string, { x: number; y: number }>();
  changing = false;

  /** The label's measured size, or the default before it is measured. */
  size(id: string) {
    return this.sizes.get(id) ?? { width: 110, height: 42 };
  }

  measure(id: string, width: number, height: number) {
    const previous = this.sizes.get(id);
    if (previous?.width === width && previous.height === height) return false;
    this.sizes.set(id, { width, height });
    return true;
  }

  layout<T extends LabelPosition>(
    anchors: T[],
    width: number,
    height: number,
    dt: number,
    motion: boolean,
    top = 52,
    selected: string | null = null,
    /** Stage regions labels must not cover, such as overlay panels. */
    obstacles: readonly LabelRect[] = [],
  ): T[] {
    const active = new Set(anchors.map((anchor) => anchor.id));
    for (const id of this.states.keys()) {
      if (!active.has(id)) {
        this.states.delete(id);
        this.sizes.delete(id);
      }
    }
    const boxes = anchors
      .map((anchor) => {
        const state = this.states.get(anchor.id) ?? {
          x: 0,
          y: 0,
          opacity: 0,
          admitted: false,
          pending: 0,
          returning: false,
        };
        this.states.set(anchor.id, state);
        const size = this.sizes.get(anchor.id) ?? { width: 110, height: 42 };
        return {
          anchor,
          state,
          ...size,
          x: anchor.x + state.x,
          y: anchor.y - size.height / 2 + state.y,
          engaged: false,
        };
      })
      .sort((a, b) => a.anchor.id.localeCompare(b.anchor.id));
    const clamp = (box: (typeof boxes)[number]) => {
      box.x = Math.max(
        box.width / 2 + 8,
        Math.min(width - box.width / 2 - 8, box.x),
      );
      box.y = Math.max(
        top + box.height / 2,
        Math.min(
          height - Math.max(36, Math.min(100, height * 0.15)) - box.height / 2,
          box.y,
        ),
      );
    };
    const targetInput = JSON.stringify([
      width,
      height,
      top,
      selected,
      boxes.map(({ anchor, width, height }) => [
        anchor.id,
        anchor.x,
        anchor.y,
        anchor.visible,
        !!anchor.attention,
        width,
        height,
      ]),
    ]);
    // Retain the target for unchanged real inputs, not another solve from the
    // animated offsets. Clamped collision feedback can otherwise keep cycling.
    if (this.targetInput !== targetInput) {
      const contacts = new Set<string>();
      for (let pass = 0; pass < 8; pass++) {
        for (const box of boxes) clamp(box);
        for (let i = 0; i < boxes.length; i++) {
          const a = boxes[i]!;
          if (!a.anchor.visible || a.anchor.fixed) continue;
          for (let j = i + 1; j < boxes.length; j++) {
            const b = boxes[j]!;
            if (
              !b.anchor.visible ||
              b.anchor.fixed ||
              a.anchor.id.startsWith("lens-") !==
                b.anchor.id.startsWith("lens-")
            )
              continue;
            const key = `${a.anchor.id}|${b.anchor.id}`;
            const gapX = (a.width + b.width) / 2 + 10;
            const gapY = (a.height + b.height) / 2 + 10;
            // Remember which side each label chose until the resources separate.
            if (
              Math.abs(a.anchor.x - b.anchor.x) < gapX + 24 &&
              Math.abs(a.anchor.y - b.anchor.y) < gapY + 24
            ) {
              contacts.add(key);
              a.engaged = true;
              b.engaged = true;
            }
            const overlapX = gapX - Math.abs(a.x - b.x);
            const overlapY = gapY - Math.abs(a.y - b.y);
            if (overlapX <= 0 || overlapY <= 0) continue;
            let separation = this.separations.get(key);
            if (!separation) {
              const axis = overlapX < overlapY * 0.65 ? "x" : "y";
              separation = { axis, direction: a[axis] <= b[axis] ? -1 : 1 };
              this.separations.set(key, separation);
            }
            const { axis, direction } = separation;
            const gap = axis === "x" ? gapX : gapY;
            const correction =
              Math.max(0, gap - direction * (a[axis] - b[axis])) / 2;
            a[axis] += correction * direction;
            b[axis] -= correction * direction;
          }
        }
      }
      for (const key of this.separations.keys())
        if (!contacts.has(key)) this.separations.delete(key);
      for (const box of boxes) {
        if (!box.engaged || box.anchor.fixed) {
          box.x = box.anchor.x;
          box.y = box.anchor.y - box.height / 2;
        }
        if (!box.anchor.fixed) clamp(box);
      }
      this.targets = new Map(
        boxes.map((box) => [box.anchor.id, { x: box.x, y: box.y }]),
      );
      this.targetInput = targetInput;
    }
    for (const box of boxes) {
      const target = this.targets.get(box.anchor.id)!;
      box.x = target.x;
      box.y = target.y;
    }
    this.changing = false;
    const smoothing = motion ? 1 - Math.exp(-dt * 8) : 1;
    const occupied: LabelRect[] = [...obstacles];
    const overlapping = (a: LabelRect, list: readonly LabelRect[]) =>
      list.some(
        (other) =>
          Math.abs(a.x - other.x) < (a.width + other.width) / 2 + 6 &&
          Math.abs(a.y - other.y) < (a.height + other.height) / 2 + 6,
      );
    const priority = (box: (typeof boxes)[number]) =>
      (box.anchor.fixed ? 2000 : 0) +
      (box.anchor.id === selected || box.anchor.id === `lens-${selected}`
        ? 1000
        : 0) +
      (box.anchor.attention ? 100 : 0) +
      (box.anchor.rank ?? 0) +
      (box.state.admitted ? 1 : 0);
    const placed = boxes
      .sort(
        (a, b) =>
          priority(b) - priority(a) || a.anchor.id.localeCompare(b.anchor.id),
      )
      .map((box) => {
        const { anchor, state } = box;
        const x = box.x - anchor.x;
        const y = box.y + box.height / 2 - anchor.y;
        // Measure actual convergence, including reduced-motion snaps to the target.
        const moving = Math.abs(x - state.x) + Math.abs(y - state.y) > 0.05;
        state.x += (x - state.x) * smoothing;
        state.y += (y - state.y) * smoothing;
        if (anchor.fixed) {
          state.x = 0;
          state.y = 0;
        }
        const rendered = {
          x: anchor.x + state.x,
          y: anchor.y + state.y - box.height / 2,
          width: box.width,
          height: box.height,
        };
        const fits =
          rendered.x - box.width / 2 >= 7 &&
          rendered.x + box.width / 2 <= width - 7 &&
          rendered.y - box.height / 2 >= top - 1 &&
          rendered.y + box.height / 2 <= height - 28;
        // A label pushed far from a small nested basin would name a neighbour.
        const leashed =
          anchor.leash === undefined || Math.hypot(x, y) <= anchor.leash;
        // Every well remains rendered and in the picker. Only labels compete for space.
        const wants = anchor.fixed
          ? anchor.visible && anchor.opacity > 0.05
          : anchor.visible &&
            fits &&
            leashed &&
            !overlapping(rendered, occupied);
        if (wants) occupied.push(rendered);
        return { box, rendered, wants, moving };
      });
    // Releases settle first, so an entering label never shares space with a
    // label that is still admitted. A fixed label is placed by its caller.
    const admitted: LabelRect[] = [...obstacles];
    for (const item of placed) {
      const { state, anchor } = item.box;
      if (!state.admitted || item.wants) continue;
      state.pending += dt;
      if (
        !motion ||
        anchor.fixed ||
        !anchor.visible ||
        state.pending >= LABEL_RELEASE
      ) {
        state.admitted = false;
        state.pending = 0;
        state.returning = true;
      }
    }
    for (const item of placed)
      if (item.box.state.admitted) admitted.push(item.rendered);
    for (const item of placed) {
      const { state, anchor } = item.box;
      if (state.admitted) {
        if (item.wants) state.pending = 0;
        continue;
      }
      if (!item.wants || overlapping(item.rendered, admitted)) {
        state.pending = 0;
        continue;
      }
      state.pending += dt;
      if (
        !motion ||
        anchor.fixed ||
        !state.returning ||
        state.pending >= LABEL_ADMIT
      ) {
        state.admitted = true;
        state.pending = 0;
        admitted.push(item.rendered);
      }
    }
    return placed.map(({ box, moving }) => {
      const { anchor, state } = box;
      const opacity = state.admitted ? (anchor.fixed ? anchor.opacity : 1) : 0;
      state.opacity = anchor.fixed
        ? opacity
        : state.opacity + (opacity - state.opacity) * smoothing;
      this.changing ||=
        moving ||
        state.pending > 0 ||
        Math.abs(opacity - state.opacity) > 0.002;
      return {
        ...anchor,
        x: anchor.x + state.x,
        y: anchor.y + state.y,
        opacity: state.opacity,
      };
    });
  }
}

export type CalloutMember = {
  id: string;
  /** The member's label point on screen; its leader line ends here. */
  x: number;
  y: number;
  visible: boolean;
  attention?: boolean;
};
export type CalloutPlacement = {
  id: string;
  side: "left" | "right";
  /** Label centre. */
  x: number;
  y: number;
  opacity: number;
  /** From the label's inner edge to the member. */
  leader: { fromX: number; fromY: number; toX: number; toY: number };
};
export type CalloutRegion = {
  width: number;
  top: number;
  bottom: number;
  obstacles?: readonly LabelRect[];
};
type CalloutState = { side: "left" | "right"; y: number; opacity: number };
const CALLOUT_GAP = 4;
const CALLOUT_INSET = 26;
/** Height kept below a full column for its overflow count. */
export const CALLOUT_OVERFLOW_ROW = 26;

/** Names every member of a dense group in two columns beside it, with leader
 * lines. Members left of the group's centre are named on the left, the rest on
 * the right, each column stacked by screen height so lines rarely cross. A
 * member changing sides fades out and back in rather than sliding across the
 * group, and only after crossing the centre by a margin. Members that cannot
 * fit are counted as overflow, attention first kept.
 */
export class CalloutLayout {
  private states = new Map<string, CalloutState>();
  private edges: { left: number; right: number } | null = null;

  reset() {
    this.states.clear();
    this.edges = null;
  }

  layout(
    members: readonly CalloutMember[],
    size: (id: string) => { width: number; height: number },
    region: CalloutRegion,
    centre: { x: number; y: number },
    dt: number,
    motion: boolean,
  ): {
    placements: CalloutPlacement[];
    overflow: Record<"left" | "right", number>;
    changing: boolean;
  } {
    const smoothing = motion ? 1 - Math.exp(-dt * 6) : 1;
    const fade = motion ? 1 - Math.exp(-dt * 8) : 1;
    const shown = members.filter((member) => member.visible);
    const active = new Set(shown.map((member) => member.id));
    for (const id of this.states.keys())
      if (!active.has(id)) this.states.delete(id);
    const overflow = { left: 0, right: 0 };
    if (!shown.length) {
      this.edges = null;
      return { placements: [], overflow, changing: false };
    }
    let minX = centre.x,
      maxX = centre.x;
    for (const member of shown) {
      minX = Math.min(minX, member.x);
      maxX = Math.max(maxX, member.x);
    }
    const target = { left: minX - CALLOUT_INSET, right: maxX + CALLOUT_INSET };
    const edges = this.edges ?? target;
    edges.left += (target.left - edges.left) * smoothing;
    edges.right += (target.right - edges.right) * smoothing;
    this.edges = edges;
    let changing =
      Math.abs(target.left - edges.left) +
        Math.abs(target.right - edges.right) >
      0.05;
    const margin = Math.max(12, (maxX - minX) * 0.06);
    const columns = {
      left: [] as CalloutMember[],
      right: [] as CalloutMember[],
    };
    const desired = new Map<string, "left" | "right">();
    for (const member of shown) {
      const state = this.states.get(member.id);
      const offset = member.x - centre.x;
      const side: "left" | "right" =
        state && Math.abs(offset) < margin
          ? state.side
          : offset < 0
            ? "left"
            : "right";
      desired.set(member.id, side);
      columns[state?.side ?? side].push(member);
    }
    const placements: CalloutPlacement[] = [];
    for (const side of ["left", "right"] as const) {
      const column = columns[side];
      if (!column.length) continue;
      const widest = Math.max(...column.map((member) => size(member.id).width));
      const span =
        side === "left"
          ? { from: edges.left - widest, to: edges.left }
          : { from: edges.right, to: edges.right + widest };
      // Panels overlapping this column shorten it from their own end.
      let top = region.top,
        bottom = region.bottom;
      const middle = (region.top + region.bottom) / 2;
      for (const obstacle of region.obstacles ?? []) {
        if (
          obstacle.x + obstacle.width / 2 < span.from ||
          obstacle.x - obstacle.width / 2 > span.to
        )
          continue;
        if (obstacle.y < middle)
          top = Math.max(top, obstacle.y + obstacle.height / 2 + 6);
        else bottom = Math.min(bottom, obstacle.y - obstacle.height / 2 - 6);
      }
      const available = Math.max(0, bottom - top);
      // Keep attention, then earlier identities, when the column is full.
      const kept = [...column].sort(
        (a, b) =>
          Number(!!b.attention) - Number(!!a.attention) ||
          a.id.localeCompare(b.id),
      );
      const fit = (space: number) => {
        let needed = 0;
        return kept.filter((member) => {
          const height = size(member.id).height + CALLOUT_GAP;
          if (needed + height > space + CALLOUT_GAP) return false;
          needed += height;
          return true;
        });
      };
      let fitting = fit(available);
      if (fitting.length < column.length) {
        // Leave a row for the overflow count below the column.
        bottom -= CALLOUT_OVERFLOW_ROW;
        fitting = fit(available - CALLOUT_OVERFLOW_ROW);
      }
      overflow[side] = column.length - fitting.length;
      const rows = fitting.sort(
        (a, b) => a.y - b.y || a.id.localeCompare(b.id),
      );
      const heights = rows.map((member) => size(member.id).height);
      const ys = rows.map((member) => member.y);
      for (let i = 0; i < ys.length; i++)
        ys[i] = Math.max(
          ys[i]!,
          i
            ? ys[i - 1]! + (heights[i - 1]! + heights[i]!) / 2 + CALLOUT_GAP
            : top + heights[0]! / 2,
        );
      for (let i = ys.length - 1; i >= 0; i--)
        ys[i] = Math.min(
          ys[i]!,
          i < ys.length - 1
            ? ys[i + 1]! - (heights[i + 1]! + heights[i]!) / 2 - CALLOUT_GAP
            : bottom - heights[i]! / 2,
        );
      rows.forEach((member, index) => {
        const { width } = size(member.id);
        let state = this.states.get(member.id);
        if (!state) {
          state = { side, y: ys[index]!, opacity: 0 };
          this.states.set(member.id, state);
        }
        const leaving = desired.get(member.id) !== state.side;
        const opacity = leaving ? 0 : 1;
        state.opacity += (opacity - state.opacity) * fade;
        if (leaving && state.opacity < 0.05) {
          // Gone from this side: reappear on the other at its new row.
          state.side = desired.get(member.id)!;
          state.opacity = 0;
          state.y = Number.NaN;
          changing = true;
          return;
        }
        if (Number.isNaN(state.y)) state.y = ys[index]!;
        state.y += (ys[index]! - state.y) * smoothing;
        changing ||=
          Math.abs(ys[index]! - state.y) > 0.05 ||
          Math.abs(opacity - state.opacity) > 0.002;
        const x =
          side === "left"
            ? Math.max(8 + width / 2, edges.left - width / 2)
            : Math.min(region.width - 8 - width / 2, edges.right + width / 2);
        const edge = side === "left" ? x + width / 2 : x - width / 2;
        placements.push({
          id: member.id,
          side,
          x,
          y: state.y,
          opacity: state.opacity,
          leader: { fromX: edge, fromY: state.y, toX: member.x, toY: member.y },
        });
      });
      for (const member of column)
        if (!rows.includes(member)) this.states.delete(member.id);
    }
    return { placements, overflow, changing };
  }
}
