import type { ReactNode } from "react";

const plannedDestinations = [
  "Inbox",
  "Projects",
  "Work",
  "Infrastructure",
  "Automations",
  "Agents",
  "Knowledge",
  "Activity",
  "Search",
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="cmd-shell">
      <a className="cmd-skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="cmd-sidebar">
        <div className="cmd-brand">
          <span className="cmd-brand-name">Commandry</span>
          <span className="cmd-brand-caption">Local foundation</span>
        </div>
        <nav aria-label="Main navigation" className="cmd-navigation">
          <a
            aria-current="page"
            className="cmd-nav-link cmd-nav-current"
            href="/"
          >
            Home
          </a>
          {plannedDestinations.map((destination) => (
            <span
              aria-disabled="true"
              className="cmd-nav-link cmd-nav-planned"
              key={destination}
            >
              <span>{destination}</span>
              <span className="cmd-nav-note">Planned</span>
            </span>
          ))}
        </nav>
        <p className="cmd-sidebar-note">
          Planned destinations are visible for orientation and are not available
          yet.
        </p>
      </aside>
      <main className="cmd-main" id="main-content">
        {children}
      </main>
    </div>
  );
}
