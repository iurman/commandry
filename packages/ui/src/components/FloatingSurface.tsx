"use client";

import {
  cloneElement,
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  ReactElement,
  ReactNode,
  Ref,
  RefAttributes,
  RefObject,
} from "react";
import { createPortal } from "react-dom";
import { positionFloatingSurface } from "../floating-position";
import type {
  FloatingAlignment,
  FloatingInsets,
  FloatingRect,
  FloatingSide,
} from "../floating-position";
import "./floating-surface.css";

export type FloatingDismissReason =
  | "trigger"
  | "close"
  | "escape"
  | "outside"
  | "anchor-removed"
  | "native"
  | "hover"
  | "focus";
type TriggerProps = ButtonHTMLAttributes<HTMLButtonElement> &
  RefAttributes<HTMLButtonElement>;
export interface FloatingSurfaceProps {
  trigger: ReactElement<TriggerProps>;
  title: string;
  children: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean, reason: FloatingDismissReason) => void;
  role?: "dialog" | "menu" | "tooltip";
  modal?: boolean;
  side?: FloatingSide;
  align?: FloatingAlignment;
  presentation?: "auto" | "anchored" | "sheet";
  width?: number;
  className?: string;
  style?: CSSProperties;
  initialFocusRef?: RefObject<HTMLElement | null>;
  closeLabel?: string;
}

interface Layer {
  id: string;
  element: HTMLElement;
  trigger: HTMLElement;
}
const layers = new WeakMap<Document, Layer[]>();
const focusableSelector =
  'button:not(:disabled), a[href], input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

function focusable(element: HTMLElement) {
  return Array.from(element.querySelectorAll<HTMLElement>(focusableSelector))
    .filter(
      (item) =>
        item.tabIndex >= 0 &&
        !item.closest('[hidden], [inert], [aria-hidden="true"]') &&
        getComputedStyle(item).display !== "none" &&
        getComputedStyle(item).visibility !== "hidden",
    )
    .sort((a, b) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    );
}
function setRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}
function containsTarget(
  element: HTMLElement | null,
  target: EventTarget | null,
) {
  return target instanceof Node && !!element?.contains(target);
}
function FloatingTrigger({
  element,
  bindings,
}: {
  element: ReactElement<TriggerProps>;
  bindings: TriggerProps;
}) {
  return cloneElement(element, bindings);
}

/** Keep fallback surfaces inside the active top layer. In ordinary documents the
 * body portal escapes the trigger's clipped/transformed scrolling ancestors.
 */
export function floatingSurfaceRoot(anchor: HTMLElement): HTMLElement {
  const doc = anchor.ownerDocument;
  const dialog = anchor.closest<HTMLDialogElement>("dialog[open]");
  const fullscreen = doc.fullscreenElement;
  if (dialog && (!fullscreen || fullscreen.contains(dialog))) return dialog;
  return fullscreen instanceof HTMLElement ? fullscreen : doc.body;
}

function visualBounds(doc: Document): FloatingRect {
  const view = doc.defaultView!;
  const viewport = view.visualViewport;
  return {
    left: viewport?.offsetLeft ?? 0,
    top: viewport?.offsetTop ?? 0,
    width: viewport?.width ?? view.innerWidth,
    height: viewport?.height ?? view.innerHeight,
  };
}

function containingBlock(element: HTMLElement): HTMLElement | null {
  for (
    let ancestor = element.parentElement;
    ancestor;
    ancestor = ancestor.parentElement
  ) {
    const css = getComputedStyle(ancestor);
    if (
      (css.transform && css.transform !== "none") ||
      (css.perspective && css.perspective !== "none") ||
      (css.filter && css.filter !== "none") ||
      /paint|layout|strict|content/.test(css.contain) ||
      /transform|perspective|filter/.test(css.willChange)
    )
      return ancestor;
  }
  return null;
}

function makeOutsideInert(element: HTMLElement) {
  const previous: { element: Element; inert: boolean }[] = [];
  for (
    let branch: HTMLElement | null = element;
    branch?.parentElement;
    branch = branch.parentElement
  ) {
    for (const sibling of branch.parentElement.children) {
      if (
        sibling === branch ||
        sibling.tagName === "SCRIPT" ||
        sibling.tagName === "STYLE"
      )
        continue;
      previous.push({ element: sibling, inert: sibling.hasAttribute("inert") });
      sibling.setAttribute("inert", "");
    }
    if (branch.parentElement === element.ownerDocument.body) break;
  }
  return () => {
    for (const item of previous)
      if (!item.inert) item.element.removeAttribute("inert");
  };
}

/** Anchored forms use dialog semantics without modal focus trapping. Small visual
 * viewports use a scrollable sheet with the same semantics. Set modal explicitly
 * for a real dialog. Menus require menuitem children; tooltips must be descriptive
 * only and must not be the sole source of required information.
 *
 * open/onOpenChange supports controlled use; defaultOpen supports local state.
 * The trigger must forward its ref to an actual button. The body portal requires
 * react-dom as a direct dependency of the consuming UI package. Native popover
 * failure uses a portal and JavaScript placement, without CSS-anchor support.
 */
export function FloatingSurface({
  trigger,
  title,
  children,
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  role = "dialog",
  modal = false,
  side = "bottom",
  align = "start",
  presentation = "auto",
  width = 340,
  className = "",
  style,
  initialFocusRef,
  closeLabel = "Close",
}: FloatingSurfaceProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const isOpen = controlledOpen ?? localOpen;
  const isModal = modal && role === "dialog";
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const surfaceRef = useRef<HTMLElement | null>(null);
  const safeAreaRef = useRef<HTMLSpanElement | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const reasonRef = useRef<FloatingDismissReason>("close");
  const callbacks = useRef({ onOpenChange, controlledOpen, initialFocusRef });
  useLayoutEffect(() => {
    callbacks.current = { onOpenChange, controlledOpen, initialFocusRef };
  });
  const change = useCallback((next: boolean, reason: FloatingDismissReason) => {
    if (hoverTimer.current !== null) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    reasonRef.current = reason;
    if (callbacks.current.controlledOpen === undefined) setLocalOpen(next);
    callbacks.current.onOpenChange?.(next, reason);
  }, []);
  useLayoutEffect(
    () => () => {
      if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
    },
    [],
  );
  const closeAfterHover = () => {
    if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => change(false, "hover"), 100);
  };
  const originalRef = trigger.props.ref;
  const triggerRef = useCallback(
    (element: HTMLButtonElement | null) => {
      anchorRef.current = element;
      setRef(originalRef, element);
    },
    [originalRef],
  );

  useLayoutEffect(() => {
    if (!isOpen || !anchorRef.current) return;
    const anchor = anchorRef.current;
    const doc = anchor.ownerDocument;
    const updateRoot = () => setRoot(floatingSurfaceRoot(anchor));
    updateRoot();
    doc.addEventListener("fullscreenchange", updateRoot);
    return () => doc.removeEventListener("fullscreenchange", updateRoot);
  }, [isOpen]);

  useLayoutEffect(() => {
    const element = surfaceRef.current;
    const anchor = anchorRef.current;
    if (!isOpen || !root || !element || !anchor) return;
    const doc = anchor.ownerDocument;
    const view = doc.defaultView!;
    const stack = layers.get(doc) ?? [];
    layers.set(doc, stack);
    const layer: Layer = { id, element, trigger: anchor };
    stack.push(layer);
    let native = false;
    let modalNative = false;
    let active = true;
    let restoreInert = () => {};
    try {
      if (
        isModal &&
        element instanceof HTMLDialogElement &&
        element.showModal
      ) {
        element.showModal();
        modalNative = true;
        native = true;
      } else if (!isModal && typeof element.showPopover === "function") {
        element.showPopover();
        native = true;
      }
    } catch {
      // The usable portal fallback also covers rejected native top-layer entry.
    }
    if (!native) element.removeAttribute("popover");
    if (isModal && !modalNative) {
      element.setAttribute("open", "");
      restoreInert = makeOutsideInert(element);
    }
    element.dataset.nativeLayer = String(native);

    const firstFocus = () => {
      const requested = callbacks.current.initialFocusRef?.current;
      const target =
        requested && element.contains(requested)
          ? requested
          : (element.querySelector<HTMLElement>(
              "[data-floating-initial-focus]",
            ) ??
            focusable(
              element.querySelector<HTMLElement>(
                ".cmd-floating-surface-content",
              )!,
            )[0] ??
            focusable(element)[0] ??
            element);
      target.focus({ preventScroll: true });
    };
    const position = () => {
      if (!active) return;
      if (!anchor.isConnected) {
        change(false, "anchor-removed");
        return;
      }
      let viewport = visualBounds(doc);
      // Legacy browsers cannot escape a clipped active dialog without top-layer
      // support. Fit its visible interior instead, keeping every control scrollable.
      if (!native && root !== doc.body) {
        const bounds = root.getBoundingClientRect();
        if (bounds.width > 0 && bounds.height > 0) {
          const left = Math.max(viewport.left, bounds.left);
          const top = Math.max(viewport.top, bounds.top);
          viewport = {
            left,
            top,
            width: Math.max(
              0,
              Math.min(viewport.left + viewport.width, bounds.right) - left,
            ),
            height: Math.max(
              0,
              Math.min(viewport.top + viewport.height, bounds.bottom) - top,
            ),
          };
        }
      }
      const safeStyle = safeAreaRef.current
        ? getComputedStyle(safeAreaRef.current)
        : null;
      const safeArea: FloatingInsets = {
        top: parseFloat(safeStyle?.paddingTop ?? "0") || 0,
        right: parseFloat(safeStyle?.paddingRight ?? "0") || 0,
        bottom: parseFloat(safeStyle?.paddingBottom ?? "0") || 0,
        left: parseFloat(safeStyle?.paddingLeft ?? "0") || 0,
      };
      const content = element.querySelector<HTMLElement>(
        ".cmd-floating-surface-content",
      )!;
      const header = element.querySelector<HTMLElement>(
        ".cmd-floating-surface-header",
      );
      const measured = element.getBoundingClientRect();
      const result = positionFloatingSurface({
        anchor: anchor.getBoundingClientRect(),
        surface: {
          width: Number.isFinite(width) ? Math.max(1, width) : 340,
          height: Math.max(
            content.scrollHeight + (header?.offsetHeight ?? 0) + 2,
            measured.height,
            120,
          ),
        },
        viewport,
        safeArea,
        side,
        align,
        presentation,
      });
      const block = native ? null : containingBlock(element);
      const bounds = block?.getBoundingClientRect();
      const scaleX =
        bounds && block?.offsetWidth
          ? bounds.width / block.offsetWidth || 1
          : 1;
      const scaleY =
        bounds && block?.offsetHeight
          ? bounds.height / block.offsetHeight || 1
          : 1;
      element.style.left = `${(result.left - (bounds?.left ?? 0)) / scaleX + (block?.scrollLeft ?? 0) - (block?.clientLeft ?? 0)}px`;
      element.style.top = `${(result.top - (bounds?.top ?? 0)) / scaleY + (block?.scrollTop ?? 0) - (block?.clientTop ?? 0)}px`;
      element.style.width = `${result.width / scaleX}px`;
      element.style.maxWidth = `${result.maxWidth / scaleX}px`;
      element.style.maxHeight = `${result.maxHeight / scaleY}px`;
      element.style.visibility = "visible";
      element.dataset.side = result.side;
      element.dataset.presentation = result.presentation;
    };
    position();
    if (role !== "tooltip") firstFocus();
    const isTop = () => stack[stack.length - 1] === layer;
    const pointer = (event: PointerEvent) => {
      if (!isTop()) return;
      const path = event.composedPath();
      if (path.includes(element) || path.includes(anchor)) return;
      change(false, "outside");
    };
    const key = (event: KeyboardEvent) => {
      if (!isTop() || event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        change(false, "escape");
      } else if (event.key === "Tab" && isModal) {
        const targets = focusable(element);
        const first = targets[0] ?? element;
        const last = targets[targets.length - 1] ?? element;
        if (
          (event.shiftKey &&
            (doc.activeElement === first || doc.activeElement === element)) ||
          (!event.shiftKey &&
            (doc.activeElement === last ||
              !element.contains(doc.activeElement)))
        ) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        }
      } else if (
        role === "menu" &&
        ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
      ) {
        const targets = focusable(element).filter((target) =>
          target.getAttribute("role")?.startsWith("menuitem"),
        );
        if (!targets.length) return;
        const current = targets.indexOf(doc.activeElement as HTMLElement);
        const index =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? targets.length - 1
              : (current +
                  (event.key === "ArrowDown" ? 1 : -1) +
                  targets.length) %
                targets.length;
        event.preventDefault();
        targets[index]?.focus();
      }
    };
    const focus = (event: FocusEvent) => {
      if (isModal && isTop() && !element.contains(event.target as Node))
        firstFocus();
    };
    const cancel = (event: Event) => {
      if (!isTop()) return;
      event.preventDefault();
      change(false, "escape");
    };
    const toggle = (event: Event) => {
      if (active && (event as ToggleEvent).newState === "closed")
        change(false, "native");
    };
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(position);
    observer?.observe(anchor);
    observer?.observe(element);
    observer?.observe(
      element.querySelector<HTMLElement>(".cmd-floating-surface-content")!,
    );
    const mutations = new MutationObserver(position);
    mutations.observe(doc.documentElement, { childList: true, subtree: true });
    doc.addEventListener("pointerdown", pointer, true);
    doc.addEventListener("keydown", key, true);
    doc.addEventListener("focusin", focus, true);
    doc.addEventListener("scroll", position, true);
    view.addEventListener("resize", position);
    view.visualViewport?.addEventListener("resize", position);
    view.visualViewport?.addEventListener("scroll", position);
    element.addEventListener("cancel", cancel);
    element.addEventListener("toggle", toggle);
    return () => {
      active = false;
      stack.splice(stack.indexOf(layer), 1);
      observer?.disconnect();
      mutations.disconnect();
      doc.removeEventListener("pointerdown", pointer, true);
      doc.removeEventListener("keydown", key, true);
      doc.removeEventListener("focusin", focus, true);
      doc.removeEventListener("scroll", position, true);
      view.removeEventListener("resize", position);
      view.visualViewport?.removeEventListener("resize", position);
      view.visualViewport?.removeEventListener("scroll", position);
      element.removeEventListener("cancel", cancel);
      element.removeEventListener("toggle", toggle);
      if (modalNative) (element as HTMLDialogElement).close();
      else if (native) element.hidePopover();
      restoreInert();
      if (
        role !== "tooltip" &&
        anchor.isConnected &&
        !["outside", "anchor-removed"].includes(reasonRef.current)
      ) {
        anchor.focus({ preventScroll: true });
      }
    };
  }, [
    isOpen,
    root,
    id,
    change,
    isModal,
    side,
    align,
    presentation,
    width,
    role,
  ]);

  const tooltip = role === "tooltip";
  const Tag = isModal ? "dialog" : "div";
  return (
    <>
      <FloatingTrigger
        element={trigger}
        bindings={{
          ref: triggerRef,
          type: trigger.props.type ?? "button",
          "aria-expanded": tooltip ? undefined : isOpen,
          "aria-controls": tooltip ? undefined : id,
          "aria-haspopup": tooltip ? undefined : role,
          "aria-describedby":
            tooltip && isOpen
              ? [trigger.props["aria-describedby"], id]
                  .filter(Boolean)
                  .join(" ")
              : trigger.props["aria-describedby"],
          onClick(event) {
            trigger.props.onClick?.(event);
            if (!event.defaultPrevented && !tooltip) change(!isOpen, "trigger");
          },
          onFocus(event) {
            trigger.props.onFocus?.(event);
            if (!event.defaultPrevented && tooltip) change(true, "focus");
          },
          onBlur(event) {
            trigger.props.onBlur?.(event);
            if (
              tooltip &&
              !containsTarget(surfaceRef.current, event.relatedTarget)
            )
              change(false, "focus");
          },
          onMouseEnter(event) {
            trigger.props.onMouseEnter?.(event);
            if (tooltip) change(true, "hover");
          },
          onMouseLeave(event) {
            trigger.props.onMouseLeave?.(event);
            if (
              tooltip &&
              !containsTarget(surfaceRef.current, event.relatedTarget)
            )
              closeAfterHover();
          },
        }}
      />
      {isOpen &&
        root &&
        createPortal(
          <Tag
            ref={(element: HTMLDialogElement | HTMLDivElement | null) => {
              surfaceRef.current = element;
            }}
            id={id}
            role={role}
            aria-modal={isModal ? true : undefined}
            aria-labelledby={tooltip ? undefined : titleId}
            aria-label={tooltip ? title : undefined}
            tabIndex={-1}
            popover={isModal ? undefined : "manual"}
            className={`cmd-floating-surface ${className}`.trim()}
            data-role={role}
            style={{ ...style, visibility: "hidden" }}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerMove={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
            onTouchStart={(event) => event.stopPropagation()}
            onTouchMove={(event) => event.stopPropagation()}
            onMouseEnter={() => {
              if (tooltip) change(true, "hover");
            }}
            onMouseLeave={(event) => {
              if (
                tooltip &&
                !containsTarget(anchorRef.current, event.relatedTarget)
              )
                closeAfterHover();
            }}
          >
            <span
              ref={safeAreaRef}
              className="cmd-floating-safe-area"
              aria-hidden="true"
            />
            {!tooltip && (
              <div className="cmd-floating-surface-header">
                <h2 id={titleId} className="cmd-floating-surface-title">
                  {title}
                </h2>
                <button
                  type="button"
                  className="cmd-floating-surface-close"
                  role={role === "menu" ? "menuitem" : undefined}
                  onClick={() => change(false, "close")}
                >
                  {closeLabel}
                </button>
              </div>
            )}
            <div className="cmd-floating-surface-content">{children}</div>
          </Tag>,
          root,
        )}
    </>
  );
}
