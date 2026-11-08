import { CheckStrip } from "../components/CheckStrip";
import { emblem, emblemTicks } from "../content/emblem";
import { LensStudy } from "../components/LensStudy";
import { Mark } from "../components/Mark";
import { WorldScene } from "../components/WorldScene";

const sections = [
  { href: "#model", label: "Model" },
  { href: "#views", label: "Views" },
  { href: "#signals", label: "Signals" },
  { href: "#agents", label: "Agents" },
  { href: "#status", label: "Status" },
];

export default function Home() {
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>

      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href="#top" aria-label="Commandry, back to top">
            <Mark size={26} className="brand-mark" />
            <span className="brand-word">Commandry</span>
          </a>
          <nav className="header-nav" aria-label="Sections">
            {sections.map((section) => (
              <a key={section.href} href={section.href}>
                {section.label}
              </a>
            ))}
          </nav>
          <a className="signin" href="/login">
            Sign in
          </a>
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        <section className="hero" id="top" aria-labelledby="hero-title">
          <div className="hero-inner">
            <HeroEmblem />
            <p className="kicker">
              <span>Personal operations system</span>
              <span className="kicker-rule" aria-hidden="true" />
              <span className="kicker-muted">In development</span>
            </p>
            <h1 className="hero-title" id="hero-title">
              <span className="line">Everything you build and run,</span>{" "}
              <span className="line line-quiet">
                held in one connected model.
              </span>
            </h1>
            <div className="hero-foot">
              <p className="lede">
                Commandry relates your projects, work, notes and infrastructure
                to each other. When something changes, it arrives with the
                reasons it matters, the next action it points to, and the
                context an agent may be given to help.
              </p>
              <div className="hero-actions">
                <a className="button" href="#model">
                  Explore Commandry
                  <svg
                    viewBox="0 0 16 16"
                    width="14"
                    height="14"
                    aria-hidden="true"
                  >
                    <path d="M8 3v10M3.5 8.5 8 13l4.5-4.5" className="g-line" />
                  </svg>
                </a>
                <a className="quiet-link" href="/login">
                  Owner sign in
                </a>
              </div>
            </div>
          </div>
        </section>

        <section
          className="section section-model"
          id="model"
          aria-labelledby="model-title"
        >
          <div className="section-head">
            <p className="section-label">The model</p>
            <h2 className="section-title" id="model-title">
              One signal, followed all the way through.
            </h2>
            <p className="section-copy">
              A certificate warning travels from the check that saw it, through
              the project it belongs to and the note that explains it, into a
              next action and a brief. Select any record to see why it is
              connected.
            </p>
          </div>
          <WorldScene />
        </section>

        <section className="section" id="views" aria-labelledby="views-title">
          <div className="section-head">
            <p className="section-label">Connected context</p>
            <h2 className="section-title" id="views-title">
              Four views of the same records.
            </h2>
            <p className="section-copy">
              Projects, work, knowledge and infrastructure are not separate apps
              stitched together. They are lenses on one set of related records,
              so the same note or service keeps its identity wherever you meet
              it.
            </p>
          </div>
          <LensStudy />
        </section>

        <section
          className="section"
          id="signals"
          aria-labelledby="signals-title"
        >
          <div className="section-head section-head-split">
            <div>
              <p className="section-label">Operational signals</p>
              <h2 className="section-title" id="signals-title">
                Observed, never assumed.
              </h2>
            </div>
            <div className="section-copy-stack">
              <p className="section-copy">
                Native HTTP and TCP checks and host collectors report what they
                actually saw, and when. Each observation lands on a resource
                that already belongs to a project.
              </p>
              <p className="section-copy">
                A resource nobody checks stays <strong>unknown</strong>.
                Commandry does not paint silence green.
              </p>
            </div>
          </div>
          <CheckStrip />
        </section>

        <section className="section" id="agents" aria-labelledby="agents-title">
          <div className="section-head">
            <p className="section-label">Context for agents</p>
            <h2 className="section-title" id="agents-title">
              A brief with edges, not a blank prompt.
            </h2>
            <p className="section-copy">
              An agent receives one objective, the sources behind it, and an
              explicit boundary. It works inside that boundary, and a person
              reviews what it proposes.
            </p>
          </div>
          <div className="agents">
            <Brief />
            <div className="capabilities">
              <div className="cap-group">
                <h3 className="cap-title">
                  <span
                    className="cap-state"
                    data-state="now"
                    aria-hidden="true"
                  />
                  Available now
                </h3>
                <ul className="cap-list">
                  <li>
                    Agents connect over MCP and read only what they are granted.
                    Knowledge, work and project resources are separate
                    capabilities.
                  </li>
                  <li>
                    Memory and evidence stay anchored to their sources, with the
                    exact revision they came from.
                  </li>
                  <li>
                    An agent can propose work. The proposal waits in your Inbox
                    and is filed only when you approve it.
                  </li>
                  <li>
                    Scoped credentials are shown once and can be revoked at any
                    time.
                  </li>
                </ul>
              </div>
              <div className="cap-group">
                <h3 className="cap-title">
                  <span
                    className="cap-state"
                    data-state="next"
                    aria-hidden="true"
                  />
                  In development
                </h3>
                <ul className="cap-list cap-list-quiet">
                  <li>
                    Agents carrying out a brief, with results verified and
                    recorded.
                  </li>
                  <li>
                    Routines and automations that declare their risk and
                    approval.
                  </li>
                  <li>Adapters for more of the services you already use.</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="status" id="status" aria-labelledby="status-title">
          <div className="status-inner">
            <Mark size={56} tile={false} className="status-mark" />
            <h2 className="status-title" id="status-title">
              Built for one operator. Still evolving.
            </h2>
            <p className="status-copy">
              Commandry is used every day by the person building it, on a single
              self-hosted server, and it changes every week. It may become a
              product for others one day. For now there is nothing to sign up
              for and nothing to buy. This page explains what it is.
            </p>
            <dl className="facts">
              <div>
                <dt>Runs on</dt>
                <dd>One self-hosted server</dd>
              </div>
              <div>
                <dt>Built with</dt>
                <dd>Next.js and PostgreSQL</dd>
              </div>
              <div>
                <dt>Reached through</dt>
                <dd>Web app and MCP</dd>
              </div>
              <div>
                <dt>In use since</dt>
                <dd>October 2026</dd>
              </div>
            </dl>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="footer-inner">
          <a className="brand" href="#top" aria-label="Commandry, back to top">
            <Mark size={22} className="brand-mark" />
            <span className="brand-word">Commandry</span>
          </a>
          <p className="footer-note">
            Examples on this page use fictional records. Nothing shown is live
            data.
          </p>
          <a className="signin" href="/login">
            Owner sign in
          </a>
        </div>
      </footer>
    </>
  );
}

function HeroEmblem() {
  // The mark's open stroke, drawn once as a timeline of the example sequence.
  const style = (delay: number) => ({ animationDelay: `${delay}ms` });
  return (
    <svg
      className="emblem"
      viewBox={`0 0 ${emblem.width} ${emblem.height}`}
      aria-hidden="true"
      focusable="false"
      style={{
        ["--draw-ms" as string]: `${emblem.drawMs}ms`,
        ["--draw-delay" as string]: `${emblem.delayMs}ms`,
      }}
    >
      <path className="emblem-base" d={emblem.d} />
      <path className="emblem-path" d={emblem.d} pathLength={1} />
      <path className="emblem-head" d={emblem.d} pathLength={1} />
      {emblemTicks.map((tick) => (
        <g
          key={tick.id}
          className="emblem-tick"
          data-end={tick.end || undefined}
          style={style(tick.delayMs)}
        >
          <circle cx={tick.x} cy={tick.y} r={tick.end ? 11 : 5.5} />
          <text x={tick.labelX} y={tick.labelY} textAnchor={tick.anchor}>
            <tspan className="emblem-time">{tick.time}</tspan>
            <tspan dx="10">{tick.label}</tspan>
          </text>
        </g>
      ))}
    </svg>
  );
}

function Brief() {
  return (
    <article className="brief" aria-labelledby="brief-title">
      <header className="brief-head">
        <p className="brief-meta">
          <span>Brief</span>
          <span>Lantern</span>
          <span>Proposal only</span>
        </p>
        <h3 className="brief-title" id="brief-title">
          Renew the lantern-api certificate
        </h3>
        <p className="brief-sub">
          Illustrative example. Nothing on this page can run it.
        </p>
      </header>

      <dl className="brief-body">
        <div className="brief-row">
          <dt>Objective</dt>
          <dd>
            Prepare the renewal for lantern-api before November 13, following
            the runbook.
          </dd>
        </div>
        <div className="brief-row">
          <dt>Evidence</dt>
          <dd>
            <ol className="brief-cites">
              <li>
                <span className="cite">1</span> HTTPS check, 09:12: certificate
                valid 6 more days
              </li>
              <li>
                <span className="cite">2</span> Renewal note, March:
                &ldquo;manual since the DNS move&rdquo;
              </li>
              <li>
                <span className="cite">3</span> Certificate runbook, five steps
              </li>
            </ol>
          </dd>
        </div>
        <div className="brief-row brief-scope">
          <dt>May</dt>
          <dd>
            <ul>
              <li>Read lantern/reader and the runbook</li>
              <li>Propose work for review</li>
            </ul>
          </dd>
        </div>
        <div className="brief-row brief-scope" data-deny="">
          <dt>May not</dt>
          <dd>
            <ul>
              <li>Deploy, restart or change DNS</li>
              <li>Read other projects</li>
            </ul>
          </dd>
        </div>
        <div className="brief-row">
          <dt>Review</dt>
          <dd>
            You approve the proposed renewal in your Inbox before anything is
            filed.
          </dd>
        </div>
      </dl>
    </article>
  );
}
