"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { AppShell, Button } from "@commandry/ui";
import {
  MAIL_DOMAINS,
  type MailAccount,
  type MailAttachment,
  type MailDraft,
  type MailDraftInput,
  type MailInbox,
  type MailMessage,
  type MailOverview,
  type MailPage,
  type MailPageQuery,
  type MailReadResult,
  type MailRule,
} from "@commandry/contracts";
import { mailApi } from "./api";
import styles from "./email.module.css";

const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "Email is unavailable.";
const address = (s: string) =>
  (s.match(/<([^<>]+)>/)?.[1] ?? s).trim().toLowerCase();
const blankDraft = (accountId: string, from: string): MailDraftInput => ({
  accountId,
  from,
  to: [],
  cc: [],
  bcc: [],
  subject: "",
  text: "",
  replyToId: null,
  supersedesId: null,
});
const draftInput = (d: MailDraft): MailDraftInput => ({
  accountId: d.accountId,
  from: d.from,
  to: d.to,
  cc: d.cc,
  bcc: d.bcc,
  subject: d.subject,
  text: d.text,
  replyToId: d.replyToId,
  supersedesId: d.id,
});
const emptyPage = { items: [], nextCursor: null };

export default function EmailWorkspace({
  initialQuery,
  initialSelected,
  initialError = "",
}: {
  initialQuery: Partial<MailPageQuery>;
  initialSelected: string | null;
  initialError?: string;
}) {
  const [accounts, setAccounts] = useState<MailAccount[]>([]),
    [overview, setOverview] = useState<MailOverview | null>(null);
  const [query, setQuery] = useState<Partial<MailPageQuery>>(initialQuery),
    [messages, setMessages] = useState<MailPage<MailMessage>>(emptyPage),
    [inboxes, setInboxes] = useState<MailPage<MailInbox>>(emptyPage);
  const [drafts, setDrafts] = useState<MailPage<MailDraft>>(emptyPage),
    [selected, setSelected] = useState<string | null>(initialSelected),
    [read, setRead] = useState<MailReadResult | null>(null);
  const [readState, setReadState] = useState<
    "idle" | "loading" | "error" | "ready"
  >(initialSelected ? "loading" : "idle");
  const [attachments, setAttachments] =
      useState<MailPage<MailAttachment>>(emptyPage),
    [compose, setCompose] = useState<MailDraftInput | null>(null),
    [saved, setSaved] = useState<MailDraft | null>(null),
    [draftKey, setDraftKey] = useState("");
  const [error, setError] = useState(initialError),
    [feedback, setFeedback] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [search, setSearch] = useState(initialQuery.q ?? ""),
    [tab, setTab] = useState<"messages" | "drafts">("messages");
  const [rules, setRules] = useState<{
      version: number;
      rules: MailRule[];
    } | null>(null),
    [rulesAccount, setRulesAccount] = useState("");
  const [ruleWord, setRuleWord] = useState(""),
    [ruleReason, setRuleReason] = useState(""),
    [ruleField, setRuleField] = useState<MailRule["field"]>("subject");
  const [projectId, setProjectId] = useState(""),
    [projects, setProjects] = useState<{ id: string; name: string }[]>([]),
    [projectCursor, setProjectCursor] = useState<string | null>(null);
  const epoch = useRef(0),
    readEpoch = useRef(0),
    mutationLock = useRef(false);
  useEffect(() => {
    let active = true;
    mailApi<{ items: MailAccount[] }>("accounts")
      .then((p) => {
        if (active) setAccounts(p.items);
      })
      .catch((e: unknown) => {
        if (active) setError(errorText(e));
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const version = ++epoch.current;
    Promise.all([
      mailApi<MailPage<MailMessage>>("messages", query),
      mailApi<MailPage<MailInbox>>("inboxes", query),
      mailApi<MailOverview>("overview", query),
      mailApi<MailPage<MailDraft>>("drafts", {}),
    ])
      .then(([m, i, o, d]) => {
        if (version !== epoch.current) return;
        setMessages(m);
        setInboxes(i);
        setOverview(o);
        setDrafts(d);
      })
      .catch((e: unknown) => {
        if (version === epoch.current) setError(errorText(e));
      })
      .finally(() => {
        if (version === epoch.current) setLoading(false);
      });
    return () => {
      if (epoch.current === version) epoch.current = version + 1;
    };
  }, [query]);
  useEffect(() => {
    const version = ++readEpoch.current;
    if (!selected) return;
    mailApi<MailReadResult>("read", { id: selected })
      .then((v) => {
        if (version === readEpoch.current) {
          setRead(v);
          setReadState("ready");
        }
      })
      .catch((e: unknown) => {
        if (version === readEpoch.current) {
          setError(errorText(e));
          setReadState("error");
        }
      });
    mailApi<MailPage<MailAttachment>>("attachments", { id: selected })
      .then((v) => {
        if (version === readEpoch.current) setAttachments(v);
      })
      .catch((e: unknown) => {
        if (version === readEpoch.current)
          setFeedback("Attachment list unavailable. " + errorText(e));
      });
    return () => {
      if (readEpoch.current === version) readEpoch.current = version + 1;
    };
  }, [selected]);
  async function act(action: () => Promise<void>) {
    if (mutationLock.current) return;
    mutationLock.current = true;
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      await action();
    } catch (e) {
      setError(errorText(e));
    } finally {
      mutationLock.current = false;
      setBusy(false);
    }
  }
  function resetQuery(next: Partial<MailPageQuery>) {
    epoch.current++;
    setLoading(true);
    setError("");
    setMessages(emptyPage);
    setInboxes(emptyPage);
    setOverview(null);
    setQuery(next);
  }
  function closeMessage() {
    readEpoch.current++;
    setSelected(null);
    setRead(null);
    setAttachments(emptyPage);
    setReadState("idle");
  }
  function scope(next: Partial<MailPageQuery>) {
    closeMessage();
    setCompose(null);
    setSaved(null);
    resetQuery(next);
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(next))
      if (v !== undefined && v !== null) p.set(k, String(v));
    window.history.replaceState(
      null,
      "",
      "/email" + (p.size ? "?" + p.toString() : ""),
    );
  }
  function open(id: string) {
    readEpoch.current++;
    setRead(null);
    setAttachments(emptyPage);
    setReadState("loading");
    setSelected(id);
    setCompose(null);
    setSaved(null);
    const p = new URLSearchParams(window.location.search);
    p.set("message", id);
    window.history.replaceState(null, "", "/email?" + p.toString());
  }
  function startCompose(value?: MailDraftInput) {
    const a = accounts[0];
    if (!a) return;
    setCompose(value ?? blankDraft(a.id, "hello@" + a.domains[0]));
    setSaved(null);
    setDraftKey(crypto.randomUUID());
    setSelected(null);
  }
  async function refresh() {
    setAccounts((await mailApi<{ items: MailAccount[] }>("accounts")).items);
    resetQuery({ ...query });
  }
  async function triage(change: Record<string, unknown>) {
    if (!selected) return;
    const m = await mailApi<MailMessage>("triage", {
      id: selected,
      expectedVersion: read?.message.version,
      ...change,
    });
    setRead((v) => (v ? { ...v, message: m } : v));
    setMessages((p) => ({
      ...p,
      items: p.items.map((old) => (old.id === m.id ? m : old)),
    }));
    setOverview(await mailApi<MailOverview>("overview", query));
    setInboxes(await mailApi<MailPage<MailInbox>>("inboxes", query));
    setFeedback("Local review saved.");
  }
  async function loadProjects(cursor?: string) {
    const response = await fetch(
      "/api/v1/projects?limit=30" +
        (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""),
    );
    if (!response.ok) throw new Error("Projects are unavailable.");
    const p = (await response.json()) as {
      items: { id: string; name: string }[];
      nextCursor: string | null;
    };
    setProjects((v) => (cursor ? [...v, ...p.items] : p.items));
    setProjectCursor(p.nextCursor);
  }
  async function more<T>(
    operation: string,
    page: MailPage<T>,
    set: (p: MailPage<T>) => void,
    input: unknown = query,
  ) {
    const next = await mailApi<MailPage<T>>(operation, {
      ...(input as object),
      cursor: page.nextCursor,
    });
    set({ items: [...page.items, ...next.items], nextCursor: next.nextCursor });
  }
  const scopeName = query.address ?? query.domain ?? "Unified mail";
  return (
    <AppShell current="Email">
      <header className="cmd-page-header cmd-workspace-heading">
        <div>
          <p className="cmd-eyebrow">Communications</p>
          <h1>Email</h1>
          <p className="cmd-lead">
            Original messages, clear attention, the right identity.
          </p>
        </div>
        <div className={styles.actions}>
          <Button disabled={busy} onClick={() => void act(refresh)}>
            Refresh
          </Button>
          <Button
            variant="primary"
            disabled={!accounts.length || busy}
            onClick={() => startCompose()}
          >
            Compose
          </Button>
        </div>
      </header>
      <div aria-live="polite">
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {feedback && <p role="status">{feedback}</p>}
      </div>
      <div className={styles.workspace}>
        <aside className={styles.rail} aria-label="Email inboxes">
          <Button onClick={() => scope({})}>Unified mail</Button>
          <div className={styles.actions}>
            <Button
              onClick={() => setTab("messages")}
              aria-pressed={tab === "messages"}
            >
              Messages
            </Button>
            <Button
              onClick={() => setTab("drafts")}
              aria-pressed={tab === "drafts"}
            >
              Drafts and sends
            </Button>
          </div>
          <h2>Domains</h2>
          {accounts.flatMap((a) =>
            a.domains.map((domain) => {
              const n = overview?.domains.find(
                (d) => d.domain === domain && d.accountId === a.id,
              );
              return (
                <div key={domain} className={styles.domain}>
                  <button
                    onClick={() => scope({ domain, accountId: a.id })}
                    aria-pressed={query.domain === domain}
                  >
                    {domain}
                  </button>
                  <small>
                    {overview
                      ? `${n?.received ?? 0} received / ${n?.sent ?? 0} sent / ${n?.unread ?? 0} unread / ${n?.attention ?? 0} attention`
                      : loading
                        ? "Loading counts..."
                        : "Counts unavailable"}
                  </small>
                </div>
              );
            }),
          )}
          <h2>Actual addresses</h2>
          <p className={styles.muted}>
            Addresses observed at the provider. Address totals overlap when mail
            has several recipients.
          </p>
          {inboxes.items.map((i) => (
            <div className={styles.domain} key={i.accountId + i.address}>
              <button
                onClick={() =>
                  scope({ accountId: i.accountId, address: i.address })
                }
              >
                {i.address}
              </button>
              <small>
                {i.received} received / {i.sent} sent / {i.unread} unread /{" "}
                {i.attention} attention
              </small>
            </div>
          ))}
          {inboxes.nextCursor && (
            <Button
              disabled={busy}
              onClick={() =>
                void act(() => more("inboxes", inboxes, setInboxes))
              }
            >
              More addresses
            </Button>
          )}
        </aside>
        <div className={styles.main}>
          <section className={styles.panel} aria-label="Email counts">
            <h2>{scopeName}</h2>
            {overview ? (
              <>
                <div className={styles.stats}>
                  {(["received", "sent", "unread", "attention"] as const).map(
                    (key) => (
                      <button
                        key={key}
                        onClick={() =>
                          scope({
                            ...query,
                            direction:
                              key === "received" || key === "sent"
                                ? key
                                : undefined,
                            view:
                              key === "unread" || key === "attention"
                                ? key
                                : "all",
                          })
                        }
                      >
                        <strong>{overview.counts[key]}</strong>
                        <span>
                          {key === "attention" ? "Needs attention" : key}
                        </span>
                      </button>
                    ),
                  )}
                </div>
                <p className={styles.muted}>{overview.population}</p>
              </>
            ) : (
              <p>{loading ? "Loading counts..." : "Counts unavailable."}</p>
            )}
          </section>
          {compose && (
            <section className={styles.panel} aria-label="Compose email">
              <h2>{compose.replyToId ? "Reply" : "Compose"}</h2>
              <form
                key={draftKey}
                className={styles.form}
                onSubmit={(e: FormEvent) => {
                  e.preventDefault();
                  void act(async () => {
                    const d = await mailApi<MailDraft>("draft", {
                      key: draftKey,
                      draft: compose,
                    });
                    setSaved(d);
                    setFeedback(
                      "Draft saved. Review the exact recipients and content below before approval.",
                    );
                  });
                }}
              >
                <label>
                  Account
                  <select
                    aria-label="Account"
                    value={compose.accountId}
                    disabled={!!compose.replyToId || !!saved}
                    onChange={(e) => {
                      const a = accounts.find((a) => a.id === e.target.value)!;
                      setCompose({
                        ...compose,
                        accountId: a.id,
                        from: "hello@" + a.domains[0],
                      });
                    }}
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  From
                  <input
                    required
                    type="email"
                    list="mail-identities"
                    disabled={!!saved}
                    value={compose.from}
                    onChange={(e) =>
                      setCompose({ ...compose, from: e.target.value })
                    }
                  />
                </label>
                <datalist id="mail-identities">
                  {inboxes.items
                    .filter((i) => i.accountId === compose.accountId)
                    .map((i) => (
                      <option key={i.address} value={i.address} />
                    ))}
                </datalist>
                {(["to", "cc", "bcc"] as const).map((field) => (
                  <label key={field}>
                    {field.toUpperCase()}
                    <input
                      required={field === "to"}
                      disabled={!!saved}
                      defaultValue={compose[field].join(", ")}
                      onChange={(e) =>
                        setCompose({
                          ...compose,
                          [field]: e.target.value
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                  </label>
                ))}
                <label>
                  Subject
                  <input
                    required
                    disabled={!!saved}
                    value={compose.subject}
                    onChange={(e) =>
                      setCompose({ ...compose, subject: e.target.value })
                    }
                  />
                </label>
                <label>
                  <span id="mail-compose-body-label">Message</span>
                  <textarea
                    aria-labelledby="mail-compose-body-label"
                    required
                    rows={10}
                    disabled={!!saved}
                    value={compose.text}
                    onChange={(e) =>
                      setCompose({ ...compose, text: e.target.value })
                    }
                  />
                </label>
                <p className={styles.muted}>
                  Send only from a currently verified domain in this account.
                  Replies retain original Message-ID references where available.
                  Composing uses plain text.
                </p>
                {!saved && (
                  <Button type="submit" variant="primary" disabled={busy}>
                    Save draft for review
                  </Button>
                )}
                <Button
                  disabled={busy}
                  onClick={() => {
                    setCompose(null);
                    setSaved(null);
                  }}
                >
                  Close compose
                </Button>
              </form>
              {saved && (
                <DraftReview
                  draft={saved}
                  busy={busy}
                  onEdit={() => {
                    setCompose(draftInput(saved));
                    setSaved(null);
                    setDraftKey(crypto.randomUUID());
                  }}
                  onApprove={() =>
                    void act(async () =>
                      setSaved(
                        await mailApi<MailDraft>("approve", { id: saved.id }),
                      ),
                    )
                  }
                  onSend={() =>
                    void act(async () => {
                      setSaved(
                        await mailApi<MailDraft>("send", { id: saved.id }),
                      );
                      setFeedback(
                        "Send queued for the background worker. Acceptance and delivery are separate outcomes.",
                      );
                    })
                  }
                />
              )}
            </section>
          )}
          {tab === "messages" ? (
            <section className={styles.panel} aria-label="Email messages">
              <form
                className={styles.filters}
                onSubmit={(e) => {
                  e.preventDefault();
                  scope({ ...query, q: search });
                }}
              >
                <label>
                  Search messages
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Subject, sender or recipient"
                  />
                </label>
                <label>
                  Direction
                  <select
                    aria-label="Direction"
                    value={query.direction ?? "all"}
                    onChange={(e) =>
                      scope({
                        ...query,
                        direction:
                          e.target.value === "all"
                            ? undefined
                            : (e.target.value as "sent" | "received"),
                      })
                    }
                  >
                    <option value="all">Sent and received</option>
                    <option value="received">Received</option>
                    <option value="sent">Sent</option>
                  </select>
                </label>
                <label>
                  Review
                  <select
                    aria-label="Review"
                    value={query.view ?? "all"}
                    onChange={(e) =>
                      scope({
                        ...query,
                        view: e.target.value as "all" | "unread" | "attention",
                      })
                    }
                  >
                    <option value="all">All messages</option>
                    <option value="unread">Unread</option>
                    <option value="attention">Needs attention</option>
                  </select>
                </label>
                <Button type="submit" disabled={busy}>
                  Search
                </Button>
              </form>
              {loading ? (
                <p>Loading messages...</p>
              ) : !messages.items.length ? (
                <p>
                  No messages match this view. Check connection coverage below
                  if you expected mail.
                </p>
              ) : (
                <ul className={styles.messages}>
                  {messages.items.map((m) => (
                    <li key={m.id}>
                      <button
                        className={styles.message}
                        onClick={() => open(m.id)}
                        aria-pressed={selected === m.id}
                      >
                        <span className={styles.row}>
                          <strong>{m.subject || "(No subject)"}</strong>
                          <small>
                            {new Date(m.occurredAt).toLocaleString()}
                          </small>
                        </span>
                        <span>
                          {m.direction === "received"
                            ? m.from
                            : m.to.join(", ")}
                        </span>
                        <small>
                          {m.direction} / {m.status}
                          {m.unread ? " / unread" : ""} / {m.attention}
                        </small>
                        {m.reasons.length > 0 && (
                          <span className={styles.reason}>
                            {m.reasons.join("; ")}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {messages.nextCursor && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    void act(() => more("messages", messages, setMessages))
                  }
                >
                  More messages
                </Button>
              )}
            </section>
          ) : (
            <section
              className={styles.panel}
              aria-label="Drafts and send history"
            >
              <h2>Drafts and send history</h2>
              {!drafts.items.length && <p>No drafts yet.</p>}
              {drafts.items.map((d) => (
                <details key={d.id}>
                  <summary>
                    {d.subject} / {d.state}
                  </summary>
                  <DraftReview
                    draft={d}
                    busy={busy}
                    onEdit={() => startCompose(draftInput(d))}
                    onApprove={() =>
                      void act(async () => {
                        const updated = await mailApi<MailDraft>("approve", {
                          id: d.id,
                        });
                        setDrafts((v) => ({
                          ...v,
                          items: v.items.map((i) =>
                            i.id === d.id ? updated : i,
                          ),
                        }));
                      })
                    }
                    onSend={() =>
                      void act(async () => {
                        const updated = await mailApi<MailDraft>("send", {
                          id: d.id,
                        });
                        setDrafts((v) => ({
                          ...v,
                          items: v.items.map((i) =>
                            i.id === d.id ? updated : i,
                          ),
                        }));
                      })
                    }
                  />
                </details>
              ))}
              {drafts.nextCursor && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    void act(() => more("drafts", drafts, setDrafts, {}))
                  }
                >
                  More drafts
                </Button>
              )}
            </section>
          )}
          {selected && (
            <section className={styles.panel} aria-label="Selected email">
              <Button onClick={closeMessage}>Close message</Button>
              {!read ? (
                <p>
                  {readState === "error"
                    ? "Original message could not be loaded. Refresh or reopen it to retry; provider retention may have expired."
                    : "Loading original message..."}
                </p>
              ) : (
                <>
                  <h2>{read.message.subject || "(No subject)"}</h2>
                  <dl className={styles.envelope}>
                    <dt>From</dt>
                    <dd>{read.message.from}</dd>
                    <dt>To</dt>
                    <dd>{read.message.to.join(", ")}</dd>
                    <dt>CC</dt>
                    <dd>{read.message.cc.join(", ") || "None"}</dd>
                    <dt>BCC</dt>
                    <dd>{read.message.bcc.join(", ") || "None reported"}</dd>
                    <dt>Reply-To</dt>
                    <dd>
                      {read.message.replyTo.join(", ") || "Original sender"}
                    </dd>
                    <dt>Received for</dt>
                    <dd>
                      {read.message.receivedFor.join(", ") ||
                        "Not separately reported"}
                    </dd>
                    <dt>Delivery</dt>
                    <dd>{read.message.status}</dd>
                    <dt>Provider reference</dt>
                    <dd>
                      {read.message.externalId} / {read.message.direction}
                    </dd>
                    <dt>Message-ID</dt>
                    <dd>{read.message.messageId ?? "Not reported"}</dd>
                  </dl>
                  <div className={styles.actions}>
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void act(() => triage({ unread: !read.message.unread }))
                      }
                    >
                      {read.message.unread ? "Mark read" : "Mark unread"}
                    </Button>
                    {(["reviewed", "resolved", "open"] as const).map(
                      (state) => (
                        <Button
                          key={state}
                          disabled={busy}
                          onClick={() =>
                            void act(() => triage({ attention: state }))
                          }
                        >
                          {state === "open"
                            ? "Reopen attention"
                            : "Mark " + state}
                        </Button>
                      ),
                    )}
                    <Button
                      disabled={busy}
                      onClick={() => {
                        const m = read.message;
                        const a = accounts.find((a) => a.id === m.accountId)!;
                        const from =
                          m.direction === "received"
                            ? [...m.to, ...m.cc, ...m.bcc, ...m.receivedFor]
                                .map(address)
                                .find((v) =>
                                  a.domains.includes(v.split("@")[1] ?? ""),
                                )
                            : address(m.from);
                        if (!from) {
                          setError("No matching reply identity was reported.");
                          return;
                        }
                        startCompose({
                          ...blankDraft(m.accountId, from),
                          to: (m.replyTo.length ? m.replyTo : [m.from]).map(
                            address,
                          ),
                          subject: /^re:/i.test(m.subject)
                            ? m.subject
                            : "Re: " + m.subject,
                          replyToId: m.id,
                        });
                      }}
                    >
                      Reply
                    </Button>
                    {read.message.messageId && (
                      <Button
                        onClick={() =>
                          scope({ threadMessageId: read.message.messageId! })
                        }
                      >
                        Related thread messages
                      </Button>
                    )}
                  </div>
                  {read.message.reasons.length > 0 && (
                    <p className={styles.reason}>
                      {read.message.reasons.join("; ")} /{" "}
                      {read.message.attention}
                    </p>
                  )}
                  <p className={styles.muted}>
                    {read.availability === "unavailable"
                      ? "Original body is unavailable (" +
                        read.unavailableReason +
                        "). Showing retained provider metadata. "
                      : "Original provider content. "}{" "}
                    Email is untrusted. Remote images and active content are
                    blocked. Read state is local to Commandry.
                  </p>
                  <pre className={styles.body}>
                    {read.content.text ?? "No plain-text body was supplied."}
                  </pre>
                  {read.content.html &&
                    read.content.nextOffset === null &&
                    read.content.offset === 0 && (
                      <details>
                        <summary>Isolated HTML view</summary>
                        <iframe
                          className={styles.html}
                          title="Isolated original email HTML"
                          sandbox=""
                          referrerPolicy="no-referrer"
                          srcDoc={
                            "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'\">" +
                            read.content.html
                          }
                        />
                      </details>
                    )}
                  {read.content.nextOffset !== null && (
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          const next = await mailApi<MailReadResult>("read", {
                            id: selected,
                            offset: read.content.nextOffset,
                          });
                          setRead({
                            ...next,
                            content: {
                              ...next.content,
                              text:
                                (read.content.text ?? "") +
                                (next.content.text ?? ""),
                              html: null,
                            },
                          });
                        })
                      }
                    >
                      Read more body
                    </Button>
                  )}
                  <details>
                    <summary>Original headers</summary>
                    <pre className={styles.body}>
                      {Object.entries(read.content.headers)
                        .map(([k, v]) => k + ": " + v)
                        .join("\n")}
                    </pre>
                  </details>
                  <h3>Original attachments</h3>
                  {attachments.items.length === 0 && (
                    <p>
                      No attachments in this page, or the attachment list is
                      unavailable.
                    </p>
                  )}
                  <ul>
                    {attachments.items.map((a) => (
                      <li key={a.id}>
                        <a
                          href={`/api/v1/email/attachment/${selected}/${a.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {a.filename}
                        </a>{" "}
                        ({a.contentType}, {a.size.toLocaleString()} bytes)
                      </li>
                    ))}
                  </ul>
                  {attachments.nextCursor && (
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void act(() =>
                          more("attachments", attachments, setAttachments, {
                            id: selected,
                          }),
                        )
                      }
                    >
                      More attachments
                    </Button>
                  )}
                  {read.message.annotation && (
                    <div>
                      <h3>Unverified triage summary</h3>
                      <p>{read.message.annotation.summary}</p>
                      <small>
                        {read.message.annotation.actorId} /{" "}
                        {read.message.annotation.at}
                      </small>
                    </div>
                  )}
                </>
              )}
            </section>
          )}
          <section className={styles.panel}>
            <h2>Connections and coverage</h2>
            {accounts.map((a) => (
              <div key={a.id}>
                <h3>{a.name}</h3>
                <p>
                  {a.receivedComplete
                    ? "Received index traversed"
                    : "Received history incomplete"}{" "}
                  /{" "}
                  {a.sentComplete
                    ? "Sent index traversed"
                    : "Sent history incomplete"}
                </p>
                <p>
                  Last page indexed:{" "}
                  {a.lastSyncedAt
                    ? new Date(a.lastSyncedAt).toLocaleString()
                    : "Never"}
                  . {a.error ? "Connection needs attention: " + a.error : ""}
                </p>
                <p>
                  {a.pendingEvents} pending provider events, {a.failedEvents}{" "}
                  with processing failures. Failed events retry with bounded
                  backoff; source page success does not establish complete
                  delivery hydration.
                </p>
                <p>
                  Provider retention: {a.retentionDays} days. Indexed metadata
                  can outlive original bodies and attachments. This is not an
                  all-time archive.
                </p>
                <p>
                  {a.verifiedDomains.length} currently verified sending domains.
                  Last checked:{" "}
                  {a.verifiedAt
                    ? new Date(a.verifiedAt).toLocaleString()
                    : "Not yet verified"}
                  .
                </p>
                <Button
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      setRulesAccount(a.id);
                      setRules(await mailApi("getRules", { id: a.id }));
                    })
                  }
                >
                  Manage attention rules
                </Button>
              </div>
            ))}
            {!accounts.length && (
              <div>
                <p>
                  Connect the existing primary Resend account for{" "}
                  {MAIL_DOMAINS.join(", ")}. Existing mail forwarding stays in
                  place.
                </p>
                <Button
                  disabled={busy}
                  onClick={() => void act(() => loadProjects())}
                >
                  Choose account context
                </Button>
                {projects.length > 0 && (
                  <form
                    className={styles.form}
                    onSubmit={(e) => {
                      e.preventDefault();
                      void act(async () => {
                        await mailApi("account", {
                          projectId,
                          name: "Primary domain email",
                        });
                        await refresh();
                      });
                    }}
                  >
                    <label>
                      Project context
                      <select
                        required
                        value={projectId}
                        onChange={(e) => setProjectId(e.target.value)}
                      >
                        <option value="">Choose a project</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p>
                      This project is the disclosure scope for explicitly
                      granted mail agents.
                    </p>
                    {projectCursor && (
                      <Button
                        onClick={() =>
                          void act(() => loadProjects(projectCursor))
                        }
                      >
                        More projects
                      </Button>
                    )}
                    <Button type="submit" disabled={busy}>
                      Register primary account
                    </Button>
                  </form>
                )}
              </div>
            )}
            <p>
              <strong>MXroute: disconnected.</strong> Direct mail to
              contact@isaacurman.com requires separate mailbox credentials.
              Resend forwards are not original MXroute messages. The existing
              provider forwarder and inactive Sieve set are preserved.
            </p>
            <details>
              <summary>Optional agent triage</summary>
              <p>
                Grant a Foundation client mail.read for the project associated
                with this account. Add mail.triage for local review and
                unverified summaries, mail.draft for proposed replies, and
                mail.send only when needed. The agent must cite original
                messages. Owner approval of the exact saved draft is required
                before an external send. No automatic replies or inference
                service is enabled.
              </p>
              <a href="/account">Manage agent access</a>
            </details>
          </section>
          {rules && (
            <section className={styles.panel} aria-label="Attention rules">
              <h2>Attention rules</h2>
              <p>
                Rules match subject, sender or recipients. Delivery failures
                also need attention. Reconciliation applies changed rules to
                existing indexed mail and preserves resolved reviews.
              </p>
              {rules.rules.map((r, index) => (
                <div className={styles.rule} key={r.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={r.enabled}
                      onChange={(e) =>
                        setRules({
                          ...rules,
                          rules: rules.rules.map((v, i) =>
                            i === index
                              ? { ...v, enabled: e.target.checked }
                              : v,
                          ),
                        })
                      }
                    />
                    {r.field} contains &quot;{r.contains}&quot;: {r.reason}
                  </label>
                  <Button
                    onClick={() =>
                      setRules({
                        ...rules,
                        rules: rules.rules.filter((v) => v.id !== r.id),
                      })
                    }
                  >
                    Remove rule
                  </Button>
                </div>
              ))}
              <form
                className={styles.form}
                onSubmit={(e) => {
                  e.preventDefault();
                  setRules({
                    ...rules,
                    rules: [
                      ...rules.rules,
                      {
                        id: crypto.randomUUID(),
                        field: ruleField,
                        contains: ruleWord,
                        reason: ruleReason,
                        enabled: true,
                      },
                    ],
                  });
                  setRuleWord("");
                  setRuleReason("");
                }}
              >
                <label>
                  Field
                  <select
                    value={ruleField}
                    onChange={(e) =>
                      setRuleField(e.target.value as MailRule["field"])
                    }
                  >
                    <option value="subject">Subject</option>
                    <option value="from">Sender</option>
                    <option value="recipient">Recipient</option>
                  </select>
                </label>
                <label>
                  Keyword
                  <input
                    required
                    value={ruleWord}
                    onChange={(e) => setRuleWord(e.target.value)}
                  />
                </label>
                <label>
                  Attention reason
                  <input
                    required
                    value={ruleReason}
                    onChange={(e) => setRuleReason(e.target.value)}
                  />
                </label>
                <Button type="submit">Add rule</Button>
              </form>
              <Button
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    setRules(
                      await mailApi("rules", {
                        accountId: rulesAccount,
                        expectedVersion: rules.version,
                        rules: rules.rules,
                      }),
                    );
                    setFeedback(
                      "Rules saved. Background reconciliation will update reasons.",
                    );
                  })
                }
              >
                Save attention rules
              </Button>
              <Button onClick={() => setRules(null)}>Close rules</Button>
            </section>
          )}
        </div>
      </div>
    </AppShell>
  );
}
function DraftReview({
  draft: d,
  busy,
  onApprove,
  onSend,
  onEdit,
}: {
  draft: MailDraft;
  busy: boolean;
  onApprove: () => void;
  onSend: () => void;
  onEdit: () => void;
}) {
  return (
    <div className={styles.draft}>
      <h3>Exact draft review</h3>
      <p>From: {d.from}</p>
      <p>To: {d.to.join(", ")}</p>
      <p>
        CC: {d.cc.join(", ") || "None"} / BCC: {d.bcc.join(", ") || "None"}
      </p>
      <h4>{d.subject}</h4>
      <pre className={styles.body}>{d.text}</pre>
      <p>
        State: {d.state}. {d.error ? "Outcome: " + d.error : ""}
      </p>
      {d.approvedUntil && (
        <p>
          Owner approval expires {new Date(d.approvedUntil).toLocaleString()}.
        </p>
      )}
      {d.providerId && (
        <p>
          Provider accepted message {d.providerId}. Delivery status appears in
          sent mail after reconciliation.
        </p>
      )}
      <div className={styles.actions}>
        {["draft", "approved", "failed"].includes(d.state) && (
          <Button disabled={busy} onClick={onEdit}>
            Edit as new draft
          </Button>
        )}
        {["draft", "approved"].includes(d.state) && (
          <Button disabled={busy} onClick={onApprove}>
            Approve this exact draft for 15 minutes
          </Button>
        )}
        {d.state === "approved" && (
          <Button variant="primary" disabled={busy} onClick={onSend}>
            Send approved draft
          </Button>
        )}
      </div>
    </div>
  );
}
