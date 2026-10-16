// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FloatingSurface } from "./FloatingSurface";

const rect = (
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  height,
  x: left,
  y: top,
  toJSON: () => ({}),
});
const observers: {
  callback: ResizeObserverCallback;
  disconnect: ReturnType<typeof vi.fn>;
}[] = [];
const dialogShowDescriptor = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  "showModal",
);
const dialogCloseDescriptor = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  "close",
);
beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal("innerWidth", 1024);
  vi.stubGlobal("innerHeight", 768);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      disconnect = vi.fn();
      observe = vi.fn();
      unobserve = vi.fn();
      constructor(callback: ResizeObserverCallback) {
        observers.push({ callback, disconnect: this.disconnect });
      }
    },
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      if (this.classList.contains("cmd-floating-surface"))
        return rect(0, 0, 340, 260);
      if (this.matches("dialog, [data-test-fullscreen]"))
        return rect(0, 0, 1024, 768);
      return rect(100, 100, 80, 36);
    },
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.body.replaceChildren();
  Reflect.deleteProperty(document, "fullscreenElement");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (HTMLElement.prototype as Partial<HTMLElement>).showPopover;
  delete (HTMLElement.prototype as Partial<HTMLElement>).hidePopover;
  if (dialogShowDescriptor)
    Object.defineProperty(
      HTMLDialogElement.prototype,
      "showModal",
      dialogShowDescriptor,
    );
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  if (dialogCloseDescriptor)
    Object.defineProperty(
      HTMLDialogElement.prototype,
      "close",
      dialogCloseDescriptor,
    );
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});
function form() {
  return (
    <FloatingSurface
      trigger={<button>Appearance</button>}
      title="Scene appearance"
    >
      <label>
        Surface
        <select>
          <option>System</option>
          <option>Midnight</option>
        </select>
      </label>
      <button>Save appearance</button>
    </FloatingSurface>
  );
}
function openForm() {
  fireEvent.click(screen.getByRole("button", { name: "Appearance" }));
  return screen.getByRole("dialog", { name: "Scene appearance" });
}

describe("floating surface interaction", () => {
  it("opens a labeled nonmodal form, focuses its control and restores focus on Escape", () => {
    render(form());
    const trigger = screen.getByRole("button", { name: "Appearance" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    const panel = openForm();
    expect(panel).not.toHaveAttribute("aria-modal");
    expect(panel).not.toHaveAttribute("role", "menu");
    expect(trigger).toHaveAttribute("aria-controls", panel.id);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Surface")).toHaveFocus();
    const escape = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    fireEvent(screen.getByLabelText("Surface"), escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("supports controlled state and explicit close", () => {
    const changes = vi.fn();
    function Controlled() {
      const [open, setOpen] = useState(false);
      return (
        <FloatingSurface
          open={open}
          onOpenChange={(next, reason) => {
            changes(next, reason);
            setOpen(next);
          }}
          trigger={<button>Settings</button>}
          title="Settings"
        >
          <input aria-label="Name" />
        </FloatingSurface>
      );
    }
    render(<Controlled />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(changes).toHaveBeenLastCalledWith(true, "trigger");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(changes).toHaveBeenLastCalledWith(false, "close");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Settings" })).toHaveFocus();
  });

  it("preserves trigger refs and prevented actions and supports an explicit initial focus", () => {
    const triggerRef = createRef<HTMLButtonElement>();
    const initial = createRef<HTMLInputElement>();
    const view = render(
      <FloatingSurface
        trigger={
          <button ref={triggerRef} onClick={(event) => event.preventDefault()}>
            Open
          </button>
        }
        title="Preferences"
      >
        <input aria-label="First" />
      </FloatingSurface>,
    );
    fireEvent.click(triggerRef.current!);
    expect(screen.queryByRole("dialog")).toBeNull();
    view.rerender(
      <FloatingSurface
        initialFocusRef={initial}
        trigger={<button ref={triggerRef}>Open</button>}
        title="Preferences"
      >
        <input aria-label="First" />
        <input aria-label="Chosen" ref={initial} />
      </FloatingSurface>,
    );
    fireEvent.click(triggerRef.current!);
    expect(initial.current).toHaveFocus();
  });

  it("leaves nonmodal Tab and outside focus usable without inertness", () => {
    const view = render(
      <>
        <button>Other action</button>
        {form()}
      </>,
    );
    openForm();
    expect(view.container).not.toHaveAttribute("inert");
    const tab = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    fireEvent(screen.getByRole("button", { name: "Save appearance" }), tab);
    expect(tab.defaultPrevented).toBe(false);
    screen.getByRole("button", { name: "Other action" }).focus();
    expect(screen.getByRole("button", { name: "Other action" })).toHaveFocus();
  });

  it("closes outside without stealing focus from the clicked action", () => {
    render(
      <>
        <button>Other action</button>
        {form()}
      </>,
    );
    const panel = openForm();
    fireEvent.pointerDown(panel);
    expect(screen.getByRole("dialog")).toBe(panel);
    const outside = screen.getByRole("button", { name: "Other action" });
    fireEvent.pointerDown(outside);
    outside.focus();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(outside).toHaveFocus();
  });

  it("dismisses only the innermost layer for Escape and restores the nested trigger", () => {
    render(
      <FloatingSurface trigger={<button>Outer trigger</button>} title="Outer">
        <FloatingSurface trigger={<button>Inner trigger</button>} title="Inner">
          <input aria-label="Nested input" />
        </FloatingSurface>
      </FloatingSurface>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Outer trigger" }));
    const innerTrigger = screen.getByRole("button", { name: "Inner trigger" });
    fireEvent.click(innerTrigger);
    expect(screen.getAllByRole("dialog")).toHaveLength(2);
    fireEvent.keyDown(screen.getByLabelText("Nested input"), { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Inner" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Outer" })).toBeTruthy();
    expect(innerTrigger).toHaveFocus();
    fireEvent.keyDown(innerTrigger, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Outer trigger" })).toHaveFocus();
  });

  it("traps focus and restores preexisting inertness only for explicit fallback modals", () => {
    const existing = document.createElement("section");
    existing.setAttribute("inert", "");
    document.body.append(existing);
    const view = render(
      <FloatingSurface
        modal
        trigger={<button>Modal trigger</button>}
        title="Confirm"
      >
        <input aria-label="Confirm name" />
        <button>Apply</button>
      </FloatingSurface>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Modal trigger" }));
    const panel = screen.getByRole("dialog", { name: "Confirm" });
    expect(panel).toHaveAttribute("aria-modal", "true");
    expect(view.container).toHaveAttribute("inert");
    const close = screen.getByRole("button", { name: "Close" });
    const apply = screen.getByRole("button", { name: "Apply" });
    apply.focus();
    fireEvent.keyDown(apply, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(apply).toHaveFocus();
    fireEvent.click(close);
    expect(view.container).not.toHaveAttribute("inert");
    expect(existing).toHaveAttribute("inert");
    existing.remove();
  });

  it("prefers the native popover top layer and mirrors native dismissal", () => {
    const show = vi.fn(function (this: HTMLElement) {
      this.style.display = "flex";
    });
    const hide = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "showPopover", {
      configurable: true,
      value: show,
    });
    Object.defineProperty(HTMLElement.prototype, "hidePopover", {
      configurable: true,
      value: hide,
    });
    render(form());
    const panel = openForm();
    expect(show).toHaveBeenCalledOnce();
    expect(panel).toHaveAttribute("data-native-layer", "true");
    expect(panel).toHaveAttribute("popover", "manual");
    const toggle = new Event("toggle");
    Object.defineProperty(toggle, "newState", { value: "closed" });
    fireEvent(panel, toggle);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(hide).toHaveBeenCalledOnce();
  });

  it("uses native modal dialog lifecycle when available", () => {
    const show = vi.fn(function (this: HTMLDialogElement) {
      this.open = true;
    });
    const close = vi.fn(function (this: HTMLDialogElement) {
      this.open = false;
    });
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value: show,
    });
    Object.defineProperty(HTMLDialogElement.prototype, "close", {
      configurable: true,
      value: close,
    });
    const view = render(
      <FloatingSurface
        modal
        trigger={<button>Native modal</button>}
        title="Native confirmation"
      >
        <input aria-label="Decision" />
      </FloatingSurface>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Native modal" }));
    expect(show).toHaveBeenCalledOnce();
    expect(screen.getByRole("dialog")).toHaveAttribute(
      "data-native-layer",
      "true",
    );
    expect(view.container).not.toHaveAttribute("inert");
    fireEvent.keyDown(screen.getByLabelText("Decision"), { key: "Escape" });
    expect(close).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Native modal" })).toHaveFocus();
  });

  it("falls back after rejected native entry and escapes clipped/transformed ancestors", () => {
    Object.defineProperty(HTMLElement.prototype, "showPopover", {
      configurable: true,
      value: () => {
        throw new DOMException("Unavailable");
      },
    });
    const scenePointer = vi.fn();
    const sceneWheel = vi.fn();
    const view = render(
      <div
        style={{
          overflow: "hidden",
          transform: "translateX(20px)",
          height: 20,
        }}
        onPointerDown={scenePointer}
        onWheel={sceneWheel}
      >
        {form()}
      </div>,
    );
    const panel = openForm();
    expect(panel.parentElement).toBe(document.body);
    expect(view.container.contains(panel)).toBe(false);
    expect(panel).toHaveAttribute("data-native-layer", "false");
    expect(panel).not.toHaveAttribute("popover");
    fireEvent.pointerDown(screen.getByLabelText("Surface"));
    fireEvent.wheel(screen.getByLabelText("Surface"), { deltaY: 80 });
    expect(scenePointer).not.toHaveBeenCalled();
    expect(sceneWheel).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Surface"), {
      target: { value: "Midnight" },
    });
    expect(screen.getByLabelText("Surface")).toHaveValue("Midnight");
  });

  it("uses the active dialog as its fallback root", () => {
    const view = render(<dialog open>{form()}</dialog>);
    const parent = view.container.querySelector("dialog")!;
    const panel = openForm();
    expect(panel.parentElement).toBe(parent);
    expect(parent).not.toHaveAttribute("inert");
  });

  it("moves inside fullscreen on entry and back to the document on exit", () => {
    let fullscreen: Element | null = null;
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreen,
    });
    const view = render(<section data-test-fullscreen>{form()}</section>);
    expect(openForm().parentElement).toBe(document.body);
    act(() => {
      fullscreen = view.container.querySelector("section");
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    expect(screen.getByRole("dialog").parentElement).toBe(fullscreen);
    act(() => {
      fullscreen = null;
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    expect(screen.getByRole("dialog").parentElement).toBe(document.body);
  });

  it("keeps the fallback inside fullscreen when its original dialog is outside that subtree", () => {
    const view = render(
      <dialog open>
        <section data-test-fullscreen>{form()}</section>
      </dialog>,
    );
    const fullscreen = view.container.querySelector("section")!;
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreen,
    });
    expect(openForm().parentElement).toBe(fullscreen);
  });

  it("repositions on nested scroll, resize, text-size changes and visual viewport zoom", () => {
    const viewport = Object.assign(new EventTarget(), {
      offsetLeft: 120,
      offsetTop: 200,
      width: 390,
      height: 300,
    });
    vi.stubGlobal("visualViewport", viewport);
    render(
      <div data-testid="scroll-parent" style={{ overflow: "auto" }}>
        {form()}
      </div>,
    );
    const panel = openForm();
    expect(panel).toHaveAttribute("data-presentation", "sheet");
    expect(panel.style.left).toBe("128px");
    expect(panel.style.maxHeight).toBe("284px");
    act(() => {
      viewport.offsetTop = 250;
      viewport.height = 220;
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(panel.style.top).toBe("258px");
    expect(panel.style.maxHeight).toBe("204px");
    act(() => {
      viewport.offsetLeft = 150;
      viewport.dispatchEvent(new Event("scroll"));
    });
    expect(panel.style.left).toBe("158px");
    act(() => {
      viewport.offsetLeft = 170;
      fireEvent.scroll(screen.getByTestId("scroll-parent"));
    });
    expect(panel.style.left).toBe("178px");
    act(() => {
      viewport.offsetLeft = 190;
      fireEvent.resize(window);
    });
    expect(panel.style.left).toBe("198px");
    act(() => {
      viewport.offsetLeft = 210;
      for (const observer of observers)
        observer.callback([], {} as ResizeObserver);
    });
    expect(panel.style.left).toBe("218px");
  });

  it("closes safely when its anchor is removed and disconnects observers", async () => {
    const view = render(form());
    openForm();
    const trigger = screen.getByRole("button", { name: "Appearance" });
    const parent = trigger.parentElement!;
    trigger.remove();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      observers.every((observer) => observer.disconnect.mock.calls.length > 0),
    ).toBe(true);
    // Restore React's owned node before unmounting after external removal.
    parent.append(trigger);
    view.unmount();
  });

  it("provides action-menu keyboard navigation and tooltip descriptions without moving focus", () => {
    const view = render(
      <FloatingSurface
        role="menu"
        trigger={<button>Actions</button>}
        title="Resource actions"
      >
        <button role="menuitem">Inspect</button>
        <button role="menuitem">Open source</button>
      </FloatingSurface>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    expect(screen.getByRole("menuitem", { name: "Inspect" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "Open source" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(screen.getByRole("menuitem", { name: "Close" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    view.unmount();
    render(
      <FloatingSurface
        role="tooltip"
        trigger={<button>Source help</button>}
        title="Source help"
      >
        Observation age is separate from availability.
      </FloatingSurface>,
    );
    const trigger = screen.getByRole("button", { name: "Source help" });
    act(() => trigger.focus());
    const tooltip = screen.getByRole("tooltip");
    expect(trigger).toHaveAttribute("aria-describedby", tooltip.id);
    expect(trigger).toHaveFocus();
    expect(trigger).not.toHaveAttribute("aria-haspopup");
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("keeps a tooltip hoverable across its gap and handles non-node pointer destinations", () => {
    vi.useFakeTimers();
    render(
      <FloatingSurface
        role="tooltip"
        trigger={<button>Help</button>}
        title="Help"
      >
        Additional description
      </FloatingSurface>,
    );
    const trigger = screen.getByRole("button", { name: "Help" });
    fireEvent.mouseEnter(trigger);
    const tooltip = screen.getByRole("tooltip");
    fireEvent.mouseLeave(trigger, { relatedTarget: document.body });
    act(() => vi.advanceTimersByTime(50));
    expect(screen.getByRole("tooltip")).toBe(tooltip);
    fireEvent.mouseEnter(tooltip);
    act(() => vi.advanceTimersByTime(150));
    expect(screen.getByRole("tooltip")).toBe(tooltip);
    fireEvent.mouseLeave(tooltip);
    act(() => vi.advanceTimersByTime(100));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
