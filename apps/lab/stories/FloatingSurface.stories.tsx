import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { FloatingSurface } from "@commandry/ui";

const meta = {
  title: "Components/Floating Surface",
  component: FloatingSurface,
  args: {
    trigger: <button>Appearance</button>,
    title: "Appearance",
    children: <AppearanceControls />,
  },
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "The shipped floating surface, inside deliberately clipped/transformed containers. Native popover is preferred; its portal fallback uses the active dialog/fullscreen root. Forms are nonmodal dialogs unless modal is explicit. Narrow visual viewports use scrollable sheets. Browser bounds and hit testing, software keyboards, physical safe areas and 200 percent zoom require coordinator/device verification; this specimen is not proof of those checks.",
      },
    },
  },
} satisfies Meta<typeof FloatingSurface>;
export default meta;
type Story = StoryObj<typeof meta>;

function AppearanceControls() {
  const [surface, setSurface] = useState("system");
  return (
    <form
      style={{ display: "grid", gap: 16 }}
      onSubmit={(event) => event.preventDefault()}
    >
      <label>
        Surface{" "}
        <select
          value={surface}
          onChange={(event) => setSurface(event.target.value)}
        >
          <option value="system">System theme</option>
          <option value="light">Porcelain</option>
          <option value="dark">Midnight</option>
        </select>
      </label>
      <label>
        <input type="checkbox" defaultChecked /> Ambient field
      </label>
      <label>
        Observation pulse <input type="color" defaultValue="#3978a8" />
      </label>
      <label>
        Long localized sector name{" "}
        <input defaultValue="Infrastructure with a deliberately long descriptive label" />
      </label>
      <FloatingSurface
        trigger={<button>Advanced appearance</button>}
        title="Advanced appearance"
      >
        <label>
          Contrast{" "}
          <select>
            <option>System preference</option>
            <option>High contrast</option>
          </select>
        </label>
        <p>Escape dismisses this surface before its parent.</p>
      </FloatingSurface>
      {Array.from({ length: 12 }, (_, index) => (
        <label key={index}>
          Additional control {index + 1}{" "}
          <input defaultValue={`Setting ${index + 1}`} />
        </label>
      ))}
      <button type="reset">Reset appearance</button>
    </form>
  );
}

function CollisionSpecimen({
  dark = false,
  modal = false,
}: {
  dark?: boolean;
  modal?: boolean;
}) {
  return (
    <section
      style={{
        minHeight: "100svh",
        padding: 16,
        boxSizing: "border-box",
        colorScheme: dark ? "dark" : "light",
        color: "CanvasText",
        background: "Canvas",
      }}
    >
      <h1>Floating surface collision study</h1>
      <p>
        Resize around control wrapping widths. Open any edge, scroll the panel,
        use its final control and test nested Escape. The surrounding card clips
        its own children.
      </p>
      <div
        style={{
          height: "65svh",
          minHeight: 320,
          overflow: "auto",
          border: "1px solid GrayText",
        }}
      >
        <div
          style={{
            position: "relative",
            height: 900,
            transform: "translateZ(0)",
            overflow: "hidden",
          }}
        >
          {(["top", "right", "bottom", "left"] as const).map((side) => (
            <div
              key={side}
              style={{
                position: "absolute",
                ...(side === "top"
                  ? { left: 8, top: 8 }
                  : side === "right"
                    ? { right: 8, top: 120 }
                    : side === "bottom"
                      ? { right: 8, bottom: 8 }
                      : { left: 8, top: 250 }),
              }}
            >
              <FloatingSurface
                trigger={<button>{side} Appearance</button>}
                title={`${side} appearance`}
                side={side}
                align="end"
                modal={modal}
                style={{ colorScheme: dark ? "dark" : "light" }}
              >
                <AppearanceControls />
              </FloatingSurface>
            </div>
          ))}
        </div>
      </div>
      <p>
        Nonmodal controls leave this action reachable:{" "}
        <button>Outside action</button>
      </p>
      <FloatingSurface
        role="menu"
        trigger={<button>Resource actions</button>}
        title="Resource actions"
      >
        <button role="menuitem">Inspect resource</button>
        <button role="menuitem">Open source</button>
      </FloatingSurface>{" "}
      <FloatingSurface
        role="tooltip"
        trigger={<button>Observation help</button>}
        title="Observation help"
      >
        A fresh observation does not establish service availability.
      </FloatingSurface>
    </section>
  );
}

export const ClippedContainer: Story = { render: () => <CollisionSpecimen /> };
export const DarkLongContent: Story = {
  render: () => <CollisionSpecimen dark />,
};
export const ExplicitModal: Story = {
  render: () => <CollisionSpecimen modal />,
};

function ActiveDialogSpecimen() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ padding: 24 }}>
      <button onClick={() => setOpen(true)}>Open modal host</button>
      <dialog
        ref={(element) => {
          if (element && open && !element.open) element.showModal();
        }}
        onClose={() => setOpen(false)}
      >
        <p>The floating form belongs to the active dialog.</p>
        <FloatingSurface
          trigger={<button>Dialog appearance</button>}
          title="Dialog appearance"
        >
          <AppearanceControls />
        </FloatingSurface>
        <form method="dialog">
          <button>Close host dialog</button>
        </form>
      </dialog>
    </div>
  );
}
export const InsideActiveDialog: Story = {
  render: () => <ActiveDialogSpecimen />,
};
