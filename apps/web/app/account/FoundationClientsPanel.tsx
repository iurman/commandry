"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  foundationClientListSchema,
  foundationClientSchema,
  foundationCreateClientSchema,
  foundationIssuedClientSchema,
  foundationMachineOperationSchema,
  listProjectsResponseSchema,
  type FoundationClient,
  type FoundationIssuedClient,
  type FoundationMachineOperation,
} from "@commandry/contracts";
import styles from "./FoundationClientsPanel.module.css";

type Props = {
  enabled: boolean;
  environment: FoundationClient["environment"];
};
type Project = ReturnType<
  typeof listProjectsResponseSchema.parse
>["items"][number];
type ClientPage = ReturnType<typeof foundationClientListSchema.parse>;
type Continuation = { after: string; asOf: string };
type LoadState = "loading" | "ready" | "error";

function statusOf(client: FoundationClient, now: number) {
  if (client.revokedAt !== null) return "Revoked";
  return Date.parse(client.expiresAt) <= now ? "Expired" : "Active";
}

function appendById<T extends { id: string }>(previous: T[], incoming: T[]) {
  return [
    ...new Map(
      [...previous, ...incoming].map((item) => [item.id, item]),
    ).values(),
  ];
}

export default function FoundationClientsPanel({
  enabled,
  environment,
}: Props) {
  if (!enabled) {
    return (
      <section
        className={"cmd-workspace-section " + styles.panel}
        aria-labelledby="foundation-clients-title"
      >
        <h2 id="foundation-clients-title">Foundation clients</h2>
        <p>
          Sign in with the owner password to view, issue, or revoke foundation
          client credentials.
        </p>
      </section>
    );
  }
  return <OwnerClients key={environment} environment={environment} />;
}

function OwnerClients({ environment }: Pick<Props, "environment">) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectCursor, setProjectCursor] = useState<string | null>(null);
  const [projectState, setProjectState] = useState<LoadState>("loading");
  const [projectId, setProjectId] = useState("");
  const [page, setPage] = useState<ClientPage | null>(null);
  const [clientState, setClientState] = useState<LoadState>("ready");
  const [name, setName] = useState("");
  const [operations, setOperations] = useState<FoundationMachineOperation[]>([
    "foundation.read",
  ]);
  const [ttlSeconds, setTtlSeconds] = useState(86400);
  const [pending, setPending] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [issued, setIssued] = useState<FoundationIssuedClient | null>(null);
  const [copyState, setCopyState] = useState<"ready" | "copied" | "error">(
    "ready",
  );
  const [formError, setFormError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionStatus, setActionStatus] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const alive = useRef(true);
  const selected = useRef("");
  const generation = useRef(0);
  const projectRequest = useRef(0);
  const clientRequest = useRef(0);
  const projectsAbort = useRef<AbortController | null>(null);
  const clientsAbort = useRef<AbortController | null>(null);
  const lastProjectCursor = useRef<string | undefined>(undefined);
  const lastClientContinuation = useRef<Continuation | undefined>(undefined);
  const mutationPending = useRef(false);
  const secretVersion = useRef(0);
  const confirmationButton = useRef<HTMLButtonElement | null>(null);
  const previousConfirmation = useRef<string | null>(null);

  const loadProjects = useCallback(async (cursor?: string) => {
    projectsAbort.current?.abort();
    const controller = new AbortController();
    projectsAbort.current = controller;
    const request = ++projectRequest.current;
    lastProjectCursor.current = cursor;
    setProjectState("loading");
    try {
      const query = new URLSearchParams({ limit: "25" });
      if (cursor) query.set("cursor", cursor);
      const response = await fetch("/api/v1/projects?" + query, {
        signal: controller.signal,
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("read failed");
      const result = listProjectsResponseSchema.parse(await response.json());
      if (
        !alive.current ||
        controller.signal.aborted ||
        request !== projectRequest.current
      )
        return;
      setProjects((previous) =>
        cursor ? appendById(previous, result.items) : result.items,
      );
      setProjectCursor(result.nextCursor);
      setProjectState("ready");
    } catch {
      if (
        alive.current &&
        !controller.signal.aborted &&
        request === projectRequest.current
      )
        setProjectState("error");
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    let disposed = false;
    queueMicrotask(() => {
      if (!disposed) void loadProjects();
    });
    return () => {
      disposed = true;
      alive.current = false;
      generation.current += 1;
      secretVersion.current += 1;
      projectsAbort.current?.abort();
      clientsAbort.current?.abort();
    };
  }, [loadProjects]);

  useEffect(() => {
    const nextExpiry = page?.items
      .filter(
        (client) =>
          client.revokedAt === null && Date.parse(client.expiresAt) > now,
      )
      .reduce(
        (next, client) => Math.min(next, Date.parse(client.expiresAt)),
        Infinity,
      );
    if (nextExpiry === undefined || !Number.isFinite(nextExpiry)) return;
    const timer = window.setTimeout(
      () => setNow(Date.now()),
      Math.min(2147483647, Math.max(1, nextExpiry - Date.now() + 1)),
    );
    return () => window.clearTimeout(timer);
  }, [page, now]);

  useEffect(() => {
    if (confirmId !== null) {
      confirmationButton.current?.focus();
      previousConfirmation.current = confirmId;
    } else if (previousConfirmation.current !== null) {
      document
        .getElementById("foundation-revoke-" + previousConfirmation.current)
        ?.focus();
      previousConfirmation.current = null;
    }
  }, [confirmId]);

  async function loadClients(scope: string, continuation?: Continuation) {
    clientsAbort.current?.abort();
    const controller = new AbortController();
    clientsAbort.current = controller;
    const request = ++clientRequest.current;
    const scopeGeneration = generation.current;
    lastClientContinuation.current = continuation;
    setClientState("loading");
    const current = () =>
      alive.current &&
      !controller.signal.aborted &&
      selected.current === scope &&
      generation.current === scopeGeneration &&
      clientRequest.current === request;
    try {
      const query = new URLSearchParams({ projectId: scope, limit: "25" });
      if (continuation) {
        query.set("after", continuation.after);
        query.set("asOf", continuation.asOf);
      }
      const response = await fetch("/api/v1/foundation/clients?" + query, {
        signal: controller.signal,
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("read failed");
      const result = foundationClientListSchema.parse(await response.json());
      if (
        result.items.some((client) => client.projectId !== scope) ||
        (continuation && result.asOf !== continuation.asOf)
      )
        throw new Error("scope mismatch");
      if (!current()) return;
      setPage((previous) => ({
        ...result,
        items:
          continuation && previous
            ? appendById(previous.items, result.items)
            : result.items,
      }));
      setClientState("ready");
      setNow(Date.now());
      if (!continuation) setUncertain(false);
    } catch {
      if (current()) setClientState("error");
    }
  }

  function changeProject(value: string) {
    if (mutationPending.current) return;
    generation.current += 1;
    selected.current = value;
    clientsAbort.current?.abort();
    clientRequest.current += 1;
    secretVersion.current += 1;
    setProjectId(value);
    setPage(null);
    setIssued(null);
    setCopyState("ready");
    setConfirmId(null);
    setFormError("");
    setActionError("");
    setActionStatus("");
    setUncertain(false);
    if (value) void loadClients(value);
    else setClientState("ready");
  }

  async function createClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      mutationPending.current ||
      issued ||
      uncertain ||
      clientState === "loading"
    )
      return;
    const input = foundationCreateClientSchema.safeParse({
      name,
      projectId: selected.current,
      operations,
      environment,
      ttlSeconds,
    });
    if (!input.success) {
      setFormError(
        "Choose a project, enter a client name, and select at least one capability and a valid lifetime.",
      );
      return;
    }
    mutationPending.current = true;
    setPending(true);
    setFormError("");
    setActionError("");
    setActionStatus("");
    const scopeGeneration = generation.current;
    const current = () =>
      alive.current &&
      generation.current === scopeGeneration &&
      selected.current === input.data.projectId;
    let attempted = false;
    try {
      const key = crypto.randomUUID();
      attempted = true;
      const response = await fetch("/api/v1/foundation/clients", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify(input.data),
      });
      if (!response.ok) throw new Error("issuance failed");
      const result = foundationIssuedClientSchema.parse(await response.json());
      if (
        result.client.projectId !== input.data.projectId ||
        result.client.environment !== environment ||
        result.client.operations.length !== input.data.operations.length ||
        result.client.operations.some(
          (operation) => !input.data.operations.includes(operation),
        )
      )
        throw new Error("scope mismatch");
      if (!current()) return;
      secretVersion.current += 1;
      setIssued(result);
      setCopyState("ready");
      setName("");
      setConfirmId(null);
      setActionStatus(
        "Client created. Save the credential before dismissing it.",
      );
      void loadClients(input.data.projectId);
    } catch {
      if (current()) {
        setUncertain(attempted);
        setFormError(
          attempted
            ? "Issuance could not be confirmed. Refresh clients and revoke any uncertain client before creating another credential. A lost response cannot reveal the credential again."
            : "Could not start issuance in this browser. Try again when secure credential creation is available.",
        );
      }
    } finally {
      mutationPending.current = false;
      if (current()) setPending(false);
    }
  }

  async function revoke(client: FoundationClient, requestedAt: number) {
    if (
      mutationPending.current ||
      clientState === "loading" ||
      confirmId !== client.id
    )
      return;
    if (
      client.revokedAt !== null ||
      Date.parse(client.expiresAt) <= requestedAt
    ) {
      setConfirmId(null);
      setNow(requestedAt);
      return;
    }
    mutationPending.current = true;
    setPending(true);
    setActionError("");
    setActionStatus("");
    const scopeGeneration = generation.current;
    const current = () =>
      alive.current &&
      generation.current === scopeGeneration &&
      selected.current === client.projectId;
    try {
      const response = await fetch(
        "/api/v1/foundation/clients/" +
          encodeURIComponent(client.id) +
          "/revoke",
        { method: "POST", credentials: "same-origin" },
      );
      if (!response.ok) throw new Error("revocation failed");
      const result = foundationClientSchema.parse(await response.json());
      if (
        result.id !== client.id ||
        result.projectId !== client.projectId ||
        result.environment !== client.environment ||
        result.revokedAt === null
      )
        throw new Error("scope mismatch");
      if (!current()) return;
      setPage((previous) =>
        previous
          ? {
              ...previous,
              items: previous.items.map((item) =>
                item.id === result.id ? result : item,
              ),
            }
          : previous,
      );
      setConfirmId(null);
      setActionStatus("Client revoked.");
    } catch {
      if (current())
        setActionError(
          "Could not confirm revocation. Refresh clients before trying again.",
        );
    } finally {
      mutationPending.current = false;
      if (current()) setPending(false);
    }
  }

  async function copyCredential() {
    if (!issued) return;
    const version = secretVersion.current;
    try {
      await navigator.clipboard.writeText(issued.token);
      if (alive.current && secretVersion.current === version)
        setCopyState("copied");
    } catch {
      if (alive.current && secretVersion.current === version)
        setCopyState("error");
    }
  }

  function dismissCredential() {
    secretVersion.current += 1;
    setIssued(null);
    setCopyState("ready");
    setActionStatus("Credential dismissed. It cannot be shown again.");
  }

  const projectName =
    projects.find((project) => project.id === projectId)?.name ?? projectId;
  const endpointPath = issued
    ? "/mcp/foundation/" + issued.client.projectId
    : "";
  const endpoint =
    typeof window === "undefined"
      ? endpointPath
      : window.location.origin + endpointPath;

  return (
    <section
      className={"cmd-workspace-section " + styles.panel}
      aria-labelledby="foundation-clients-title"
    >
      <div>
        <h2 id="foundation-clients-title">Foundation clients</h2>
        <p>
          Issue a named, expiring credential for one project. Owner password
          sign-in is required; each request is checked by the server.
        </p>
      </div>
      <div className={styles.field}>
        <label htmlFor="foundation-project">Project</label>
        <select
          id="foundation-project"
          value={projectId}
          disabled={pending || projects.length === 0}
          onChange={(event) => changeProject(event.target.value)}
        >
          <option value="">Choose a project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </div>
      {projectState === "loading" && <p role="status">Loading projects...</p>}
      {projectState === "error" && (
        <div>
          <p role="alert">Could not load projects.</p>
          <button
            type="button"
            onClick={() => void loadProjects(lastProjectCursor.current)}
          >
            Retry projects
          </button>
        </div>
      )}
      {projectState === "ready" && projects.length === 0 && (
        <p>No projects are available.</p>
      )}
      {projectCursor && (
        <button
          className={styles.selfStart}
          type="button"
          disabled={projectState === "loading"}
          onClick={() => void loadProjects(projectCursor)}
        >
          Load more projects
        </button>
      )}

      {projectId && (
        <>
          <div className={styles.heading}>
            <h3>Clients for {projectName}</h3>
            <button
              type="button"
              disabled={pending || clientState === "loading"}
              onClick={() => void loadClients(projectId)}
            >
              Refresh clients
            </button>
          </div>
          <p className={styles.hint}>
            All client statuses in {environment} are included. Load more to
            continue through this project&apos;s clients.
          </p>
          {clientState === "loading" && <p role="status">Loading clients...</p>}
          {clientState === "error" && (
            <div>
              <p role="alert">
                Could not load clients. Any credential shown below remains
                available until you dismiss it or leave this project.
              </p>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  void loadClients(projectId, lastClientContinuation.current)
                }
              >
                Retry clients
              </button>
            </div>
          )}
          {clientState === "ready" && page?.items.length === 0 && (
            <p>No clients for this project.</p>
          )}
          {page && (
            <>
              <p className={styles.hint}>
                Creation cutoff: <time dateTime={page.asOf}>{page.asOf}</time>.
                Refresh to include newly created clients.
              </p>
              <ul className={styles.clients} aria-label="Foundation clients">
                {page.items.map((client) => {
                  const status = statusOf(client, now);
                  return (
                    <li className={styles.card} key={client.id}>
                      <div className={styles.heading}>
                        <h4>{client.name}</h4>
                        <span className={styles.status}>{status}</span>
                      </div>
                      <dl className={styles.metadata}>
                        <dt>Project</dt>
                        <dd>{projectName}</dd>
                        <dt>Environment</dt>
                        <dd>{client.environment}</dd>
                        <dt>Capabilities</dt>
                        <dd>{client.operations.join(", ")}</dd>
                        <dt>Expires</dt>
                        <dd>
                          <time dateTime={client.expiresAt}>
                            {client.expiresAt}
                          </time>
                        </dd>
                        {client.revokedAt !== null && (
                          <>
                            <dt>Revoked</dt>
                            <dd>
                              <time dateTime={client.revokedAt}>
                                {client.revokedAt}
                              </time>
                            </dd>
                          </>
                        )}
                      </dl>
                      {status === "Active" &&
                        (confirmId === client.id ? (
                          <div
                            className={styles.confirm}
                            role="group"
                            aria-label={"Revoke " + client.name}
                          >
                            <p>
                              Revoke {client.name}? This credential will stop
                              working immediately.
                            </p>
                            <div className={styles.actions}>
                              <button
                                type="button"
                                disabled={pending || clientState === "loading"}
                                ref={confirmationButton}
                                onClick={() => void revoke(client, Date.now())}
                              >
                                Confirm revoke
                              </button>
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => setConfirmId(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            className={styles.selfStart}
                            type="button"
                            id={"foundation-revoke-" + client.id}
                            aria-label={"Revoke " + client.name}
                            disabled={pending || clientState === "loading"}
                            onClick={() => {
                              setConfirmId(client.id);
                              setActionError("");
                            }}
                          >
                            Revoke
                          </button>
                        ))}
                    </li>
                  );
                })}
              </ul>
              {page.nextCursor && (
                <button
                  className={styles.selfStart}
                  type="button"
                  disabled={pending || clientState === "loading"}
                  onClick={() =>
                    void loadClients(projectId, {
                      after: page.nextCursor!,
                      asOf: page.asOf,
                    })
                  }
                >
                  Load more clients
                </button>
              )}
            </>
          )}
        </>
      )}
      {actionError && <p role="alert">{actionError}</p>}
      {actionStatus && <p role="status">{actionStatus}</p>}

      {issued && (
        <section
          className={styles.credential}
          aria-labelledby="foundation-credential-title"
        >
          <h3 id="foundation-credential-title">Save this credential now</h3>
          <p>
            Credential shown once; store it outside Commandry knowledge. It
            cannot be retrieved after dismissal.
          </p>
          <label htmlFor="foundation-credential">One-time credential</label>
          <textarea
            id="foundation-credential"
            readOnly
            value={issued.token}
            rows={2}
            spellCheck={false}
            autoComplete="off"
          />
          <p>
            MCP endpoint for {projectName} ({issued.client.environment})
          </p>
          <code className={styles.endpoint}>{endpoint}</code>
          <div className={styles.actions}>
            <button type="button" onClick={() => void copyCredential()}>
              Copy credential
            </button>
            <button type="button" onClick={dismissCredential}>
              Dismiss credential
            </button>
          </div>
          {copyState === "copied" && <p role="status">Credential copied.</p>}
          {copyState === "error" && (
            <p role="alert">
              Could not copy. Select and copy the credential manually.
            </p>
          )}
        </section>
      )}

      <form
        className={styles.form}
        onSubmit={(event) => void createClient(event)}
      >
        <h3>Create a client</h3>
        <p>
          Environment: <strong>{environment}</strong>. This scope is fixed by
          the server.
        </p>
        <fieldset disabled={pending}>
          <legend>Client details</legend>
          <div className={styles.field}>
            <label htmlFor="foundation-client-name">Client name</label>
            <input
              id="foundation-client-name"
              required
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="off"
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="foundation-client-lifetime">Lifetime</label>
            <select
              id="foundation-client-lifetime"
              value={ttlSeconds}
              onChange={(event) => setTtlSeconds(Number(event.target.value))}
            >
              <option value={3600}>1 hour</option>
              <option value={86400}>24 hours</option>
              <option value={604800}>7 days</option>
              <option value={2592000}>30 days</option>
            </select>
          </div>
        </fieldset>
        <fieldset disabled={pending}>
          <legend>Capabilities</legend>
          <p className={styles.hint}>
            Writes start off. Select only the operations this client needs.
            Owner decisions are unavailable to machine clients.
          </p>
          {foundationMachineOperationSchema.options.map((operation) => (
            <label className={styles.checkbox} key={operation}>
              <input
                type="checkbox"
                checked={operations.includes(operation)}
                onChange={(event) =>
                  setOperations((previous) =>
                    event.target.checked
                      ? [...previous, operation]
                      : previous.filter((value) => value !== operation),
                  )
                }
              />
              <span>{operation}</span>
            </label>
          ))}
        </fieldset>
        {formError && <p role="alert">{formError}</p>}
        {issued && (
          <p className={styles.hint}>
            Save and dismiss the current credential before creating another
            client.
          </p>
        )}
        <p className={styles.hint}>
          A lost issuance response requires refreshing clients and revoking any
          uncertain client before a new issuance. Credentials cannot be revealed
          again.
        </p>
        <button
          className={styles.selfStart}
          type="submit"
          disabled={
            pending ||
            !projectId ||
            clientState === "loading" ||
            issued !== null ||
            uncertain
          }
        >
          {pending ? "Saving client..." : "Create client"}
        </button>
      </form>
    </section>
  );
}
