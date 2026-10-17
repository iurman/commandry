export type FloatingSide = "top" | "bottom" | "left" | "right";
export type FloatingAlignment = "start" | "center" | "end";
export interface FloatingRect {
  left: number;
  top: number;
  width: number;
  height: number;
}
export interface FloatingInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
export interface FloatingPositionOptions {
  anchor: FloatingRect;
  surface: { width: number; height: number };
  viewport: FloatingRect;
  safeArea?: Partial<FloatingInsets>;
  side?: FloatingSide;
  align?: FloatingAlignment;
  gap?: number;
  padding?: number;
  presentation?: "auto" | "anchored" | "sheet";
}
export interface FloatingPosition {
  left: number;
  top: number;
  width: number;
  height: number;
  maxWidth: number;
  maxHeight: number;
  side: FloatingSide;
  presentation: "anchored" | "sheet";
}

const nonnegative = (value: number) =>
  Number.isFinite(value) ? Math.max(0, value) : 0;
const finite = (value: number) => (Number.isFinite(value) ? value : 0);
const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(value, Math.max(low, high)));

/** CSS-pixel coordinates in the layout viewport, including visual viewport offsets.
 * A zero-sized viewport returns a zero-sized surface; no controls can be usable
 * until the browser supplies visible space. Native CSS anchors are not required.
 */
export function positionFloatingSurface({
  anchor,
  surface,
  viewport,
  safeArea = {},
  side = "bottom",
  align = "start",
  gap = 8,
  padding = 8,
  presentation = "auto",
}: FloatingPositionOptions): FloatingPosition {
  const viewportWidth = nonnegative(viewport.width);
  const viewportHeight = nonnegative(viewport.height);
  const insetLeft = Math.min(viewportWidth, nonnegative(safeArea.left ?? 0));
  const insetTop = Math.min(viewportHeight, nonnegative(safeArea.top ?? 0));
  const usableWidth = Math.max(
    0,
    viewportWidth - insetLeft - nonnegative(safeArea.right ?? 0),
  );
  const usableHeight = Math.max(
    0,
    viewportHeight - insetTop - nonnegative(safeArea.bottom ?? 0),
  );
  const padX = Math.min(nonnegative(padding), usableWidth / 2);
  const padY = Math.min(nonnegative(padding), usableHeight / 2);
  const left = finite(viewport.left) + insetLeft + padX;
  const top = finite(viewport.top) + insetTop + padY;
  const maxWidth = Math.max(0, usableWidth - padX * 2);
  const maxHeight = Math.max(0, usableHeight - padY * 2);
  const right = left + maxWidth;
  const bottom = top + maxHeight;
  const width = Math.min(nonnegative(surface.width), maxWidth);
  const height = Math.min(nonnegative(surface.height), maxHeight);
  if (
    presentation === "sheet" ||
    (presentation === "auto" && (viewportWidth <= 480 || maxHeight < 160))
  ) {
    return {
      left,
      top: bottom - height,
      width: maxWidth,
      height,
      maxWidth,
      maxHeight,
      side: "bottom",
      presentation: "sheet",
    };
  }

  const anchorLeft = clamp(finite(anchor.left), left, right);
  const anchorTop = clamp(finite(anchor.top), top, bottom);
  const anchorWidth = nonnegative(anchor.width);
  const anchorHeight = nonnegative(anchor.height);
  const anchorRight = clamp(anchorLeft + anchorWidth, left, right);
  const anchorBottom = clamp(anchorTop + anchorHeight, top, bottom);
  const distance = nonnegative(gap);
  const room: Record<FloatingSide, number> = {
    top: clamp(anchorTop - distance - top, 0, maxHeight),
    bottom: clamp(bottom - anchorBottom - distance, 0, maxHeight),
    left: clamp(anchorLeft - distance - left, 0, maxWidth),
    right: clamp(right - anchorRight - distance, 0, maxWidth),
  };
  const opposite: Record<FloatingSide, FloatingSide> = {
    top: "bottom",
    bottom: "top",
    left: "right",
    right: "left",
  };
  const required = side === "left" || side === "right" ? width : height;
  const flipped = opposite[side];
  if (Math.max(room[side], room[flipped]) === 0) {
    return {
      left,
      top: bottom - height,
      width: maxWidth,
      height,
      maxWidth,
      maxHeight,
      side: "bottom",
      presentation: "sheet",
    };
  }
  const actualSide =
    room[side] < required && room[flipped] > room[side] ? flipped : side;
  const vertical = actualSide === "top" || actualSide === "bottom";
  const fittedWidth = vertical ? width : Math.min(width, room[actualSide]);
  const fittedHeight = vertical ? Math.min(height, room[actualSide]) : height;
  const crossPosition = (start: number, size: number, extent: number) =>
    align === "end"
      ? start + extent - size
      : align === "center"
        ? start + (extent - size) / 2
        : start;
  const x = vertical
    ? crossPosition(anchorLeft, fittedWidth, anchorWidth)
    : actualSide === "right"
      ? anchorRight + distance
      : anchorLeft - distance - fittedWidth;
  const y = vertical
    ? actualSide === "bottom"
      ? anchorBottom + distance
      : anchorTop - distance - fittedHeight
    : crossPosition(anchorTop, fittedHeight, anchorHeight);
  return {
    left: clamp(x, left, right - fittedWidth),
    top: clamp(y, top, bottom - fittedHeight),
    width: fittedWidth,
    height: fittedHeight,
    maxWidth: vertical ? maxWidth : room[actualSide],
    maxHeight: vertical ? room[actualSide] : maxHeight,
    side: actualSide,
    presentation: "anchored",
  };
}
