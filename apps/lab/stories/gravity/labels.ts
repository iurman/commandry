import { surfaceHeight } from "./model";
import type { Well } from "./model";

export type LabelPosition = {
  id: string;
  x: number;
  y: number;
  visible: boolean;
  opacity: number;
};
type State = { x: number; y: number; opacity: number };
type Separation = { axis: "x" | "y"; direction: number };

// Labels belong to the structural crest, not the animated floor or a neighbour.
export function labelHeight(well: Well, parent?: Well) {
  return (
    surfaceHeight(well.x, well.z, parent ? [parent] : []) +
    well.elevation +
    well.radius * 0.13 +
    0.8
  );
}

export class LabelLayout {
  private states = new Map<string, State>();
  private separations = new Map<string, Separation>();
  private sizes = new Map<string, { width: number; height: number }>();
  changing = false;

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
        const state = this.states.get(anchor.id) ?? { x: 0, y: 0, opacity: 0 };
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
        Math.min(height - 100 - box.height / 2, box.y),
      );
    };
    const contacts = new Set<string>();
    for (let pass = 0; pass < 8; pass++) {
      for (const box of boxes) clamp(box);
      for (let i = 0; i < boxes.length; i++) {
        const a = boxes[i]!;
        if (!a.anchor.visible) continue;
        for (let j = i + 1; j < boxes.length; j++) {
          const b = boxes[j]!;
          if (
            !b.anchor.visible ||
            a.anchor.id.startsWith("lens-") !== b.anchor.id.startsWith("lens-")
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
    this.changing = false;
    const smoothing = motion ? 1 - Math.exp(-dt * 8) : 1;
    return boxes.map((box) => {
      if (!box.engaged) {
        box.x = box.anchor.x;
        box.y = box.anchor.y - box.height / 2;
      }
      clamp(box);
      const { anchor, state } = box;
      const x = box.x - anchor.x;
      const y = box.y + box.height / 2 - anchor.y;
      const opacity = anchor.visible ? 1 : 0;
      state.x += (x - state.x) * smoothing;
      state.y += (y - state.y) * smoothing;
      state.opacity += (opacity - state.opacity) * smoothing;
      this.changing ||=
        Math.abs(x - state.x) + Math.abs(y - state.y) > 0.05 ||
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
