"use client";
import { useEffect, useState } from "react";
import type { MailOverview } from "@commandry/contracts";
import { mailApi } from "./api";

export function EmailOverview() {
  const [data, setData] = useState<MailOverview | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    mailApi<MailOverview>("overview")
      .then((v) => {
        if (
          !v.counts ||
          !Array.isArray(v.accounts) ||
          !Array.isArray(v.recent?.items)
        )
          throw new Error("Email overview is unavailable.");
        if (active) setData(v);
      })
      .catch((e: unknown) => {
        if (active)
          setError(
            e instanceof Error ? e.message : "Email overview is unavailable.",
          );
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section
      className="cmd-project-change-card"
      aria-labelledby="mail-overview-title"
    >
      <h2 id="mail-overview-title">
        <a href="/email">Email</a>
      </h2>
      {error ? (
        <p role="status">{error}</p>
      ) : !data ? (
        <p>Loading email overview...</p>
      ) : (
        <>
          <p>
            <a href="/email?direction=received">
              {data.counts.received} received
            </a>
            {" / "}
            <a href="/email?direction=sent">{data.counts.sent} sent</a>
            {" / "}
            <a href="/email?view=unread">{data.counts.unread} unread</a>
            {" / "}
            <a href="/email?view=attention">
              {data.counts.attention} needing attention
            </a>
          </p>
          {!data.accounts.length ? (
            <p>
              No email account is connected. <a href="/email">Set up email</a>.
            </p>
          ) : (
            <p>
              Indexed provider history.{" "}
              {data.accounts.some((a) => !a.receivedComplete || !a.sentComplete)
                ? "Initial history is incomplete."
                : "Initial index traversal finished; provider retention still applies."}
            </p>
          )}
          <ul className="cmd-record-list">
            {data.recent.items.map((m) => (
              <li key={m.id}>
                <a href={`/email?message=${m.id}`}>
                  {m.subject || "(No subject)"}
                </a>{" "}
                <small>
                  {m.direction} / {new Date(m.occurredAt).toLocaleString()}
                </small>
                {m.reasons.length > 0 && m.attention === "open" && (
                  <p>{m.reasons.join("; ")}</p>
                )}
              </li>
            ))}
          </ul>
          <p>
            <small>
              Read at {new Date(data.asOf).toLocaleString()}. Direct MXroute
              mail needs its independent connection.
            </small>
          </p>
        </>
      )}
    </section>
  );
}
