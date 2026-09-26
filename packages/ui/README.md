# Shared UI foundation

`@commandry/ui` exports presentation components and semantic CSS. Its source is
used by the web application and the local Storybook lab. It does not own domain
state or fetch data.

## Tokens

Import `@commandry/ui/tokens.css` when rendering components outside the web
application. The web application imports the same stylesheet through its
Tailwind v4 entrypoint. Components use semantic variables for canvas, surfaces,
content, borders, focus, and state tones. The light, dark, and high-contrast
values are a foundation for testing, not a settled visual identity.

The stylesheet respects system reduced motion and accepts
`data-reduced-sensory="true"` on the root element. Motion never gates content.

## Components

| Export | Use | Contract |
| --- | --- | --- |
| `AppShell` | Frame the initial web navigation | Home is the only link; planned destinations are labeled and non-interactive. A skip link reaches main content. |
| `StatePanel` | Present one section's data state | `normal`, `loading`, `empty`, `error`, `disabled`, and `permission-denied` are explicit text states. Loading sets `aria-busy`; error text uses an alert role. Non-normal states do not render stale children. |
| `StatusBadge` | Label one state dimension | A visible dimension and label accompany the tone. Lifecycle, health, attention, sync, and execution remain separate. |
| `Button` | Present an actual available action | Primary and secondary variants share focus and target sizing. Native `disabled` is supported. Do not render a button for an unfinished product action. |

The lab stories render these exports with normal, loading, empty, error,
disabled, and permission-denied examples. Focus and state text remain visible
without motion, sound, or color alone. Components assume a responsive container
and wrap or stack at narrow widths.
