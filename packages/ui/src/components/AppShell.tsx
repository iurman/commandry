import type { ReactNode } from "react";

const plannedDestinations = [
  "Inbox",
  "Work",
  "Infrastructure",
  "Automations",
  "Agents",
  "Knowledge",
  "Activity",
  "Search",
] as const;

export function AppShell({
  children,
  current = "Home",
}: {
  children: ReactNode;
  current?: "Home" | "Projects";
}) {
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
            aria-current={current === "Home" ? "page" : undefined}
            className={`cmd-nav-link ${current === "Home" ? "cmd-nav-current" : ""}`}
            href="/"
          >
            Home
          </a>
          <a
            aria-current={current === "Projects" ? "page" : undefined}
            className={`cmd-nav-link ${current === "Projects" ? "cmd-nav-current" : ""}`}
            href="/projects"
          >
            Projects
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
          <span className="cmd-mobile-nav-hint">Swipe to see more. </span>
          Other destinations are visible for orientation and are not available
          yet.
        </p>
      </aside>
      <main className="cmd-main" id="main-content">
        {children}
      </main>
    </div>
  );
}
