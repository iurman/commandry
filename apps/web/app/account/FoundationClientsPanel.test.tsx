// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FoundationClient } from "@commandry/contracts";
import FoundationClientsPanel from "./FoundationClientsPanel";

const projectId = "0ef5d360-5d30-4863-a148-b4e4ba020101";
const secondProjectId = "0ef5d360-5d30-4863-a148-b4e4ba020102";
const cursorId = "0ef5d360-5d30-4863-a148-b4e4ba020103";
const cutoff = "2026-10-16T09:00:00.000Z";
const laterCutoff = "2026-10-16T10:00:00.000Z";
const token = "af_" + "a".repeat(43);
const project = {
  id: projectId,
  name: "Notebook",
  summary: null,
  type: "general",
  lifecycle: "active",
  createdAt: "2026-10-01T09:00:00.000Z",
  updatedAt: "2026-10-01T09:00:00.000Z",
};
const secondProject = {
  ...project,
  id: secondProjectId,
  name: "Second project",
};
const client: FoundationClient = {
  schemaVersion: 1,
  id: "0ef5d360-5d30-4863-a148-b4e4ba020201",
  projectId,
  name: "Notebook reader",
  operations: ["foundation.read"],
  environment: "preview",
  createdAt: "2026-10-01T09:00:00.000Z",
  expiresAt: "2035-10-01T09:00:00.000Z",
  revokedAt: null,
  createdBy: "owner",
};
const issuedBody = (value = client) => ({
  client: value,
  token,
  notice: "Credential shown once; store it outside Commandry knowledge.",
});
const projectPage = (items = [project], nextCursor: string | null = null) => ({
  items,
  nextCursor,
});
const clientPage = (
  items: FoundationClient[] = [],
  nextCursor: string | null = null,
  asOf = cutoff,
) => ({ items, nextCursor, asOf });
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
function selectProject(id = projectId) {
  fireEvent.change(screen.getByLabelText("Project"), { target: { value: id } });
}
async function readyForCreation() {
  await screen.findByRole("option", { name: "Notebook" });
  selectProject();
  await screen.findByText("No clients for this project.");
  fireEvent.change(screen.getByLabelText("Client name"), {
    target: { value: "New client" },
  });
}
function submit() {
  fireEvent.submit(
    screen.getByRole("heading", { name: "Create a client" }).closest("form")!,
  );
}
function postCalls(mock: ReturnType<typeof vi.fn>) {
  return mock.mock.calls.filter(
    (call) => (call[1] as RequestInit | undefined)?.method === "POST",
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Foundation owner clients", () => {
  it("requires owner password sign-in without fetching and aborts reads when disabled", async () => {
    const pendingRead = deferred<Response>();
    const fetchMock = vi.fn(() => pendingRead.promise);
    vi.stubGlobal("fetch", fetchMock);
    const view = render(
      <FoundationClientsPanel enabled={false} environment="local" />,
    );
    expect(screen.getByText(/Sign in with the owner password/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    view.rerender(<FoundationClientsPanel enabled environment="local" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const signal = (
      fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    )[1].signal!;
    view.rerender(
      <FoundationClientsPanel enabled={false} environment="local" />,
    );
    expect(signal.aborted).toBe(true);
    await act(async () => pendingRead.resolve(json(projectPage())));
    expect(screen.queryByRole("option", { name: "Notebook" })).toBeNull();
    expect(postCalls(fetchMock)).toHaveLength(0);
  });

  it("keeps selected projects while appending and reaches projects beyond the first page", async () => {
    const fetchMock = vi.fn(async (path: string) => {
      const url = new URL(path, "http://localhost");
      if (url.pathname === "/api/v1/projects")
        return json(
          url.searchParams.has("cursor")
            ? projectPage([secondProject])
            : projectPage([project], cursorId),
        );
      return json(clientPage());
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<FoundationClientsPanel enabled environment="preview" />);
    await screen.findByRole("option", { name: "Notebook" });
    expect((screen.getByLabelText("Project") as HTMLSelectElement).value).toBe(
      "",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    selectProject();
    await screen.findByText("No clients for this project.");
    fireEvent.click(screen.getByRole("button", { name: "Load more projects" }));
    await screen.findByRole("option", { name: "Second project" });
    expect((screen.getByLabelText("Project") as HTMLSelectElement).value).toBe(
      projectId,
    );
    expect(
      fetchMock.mock.calls.some(
        ([path]) => path === "/api/v1/projects?limit=25&cursor=" + cursorId,
      ),
    ).toBe(true);
    selectProject(secondProjectId);
    await screen.findByRole("heading", { name: "Clients for Second project" });
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([path]) =>
            path ===
            "/api/v1/foundation/clients?projectId=" +
              secondProjectId +
              "&limit=25",
        ),
      ).toBe(true),
    );
    expect(
      screen.queryByRole("button", { name: "Load more projects" }),
    ).toBeNull();
    expect(postCalls(fetchMock)).toHaveLength(0);
  });

  it("continues clients with the original cutoff, includes inactive clients, and refreshes from the beginning", async () => {
    const revoked = {
      ...client,
      id: cursorId,
      name: "Revoked writer",
      operations: ["memory.propose"] as FoundationClient["operations"],
      revokedAt: cutoff,
    };
    const expired = {
      ...client,
      id: "0ef5d360-5d30-4863-a148-b4e4ba020202",
      name: "Expired reader",
      expiresAt: "2026-10-02T09:00:00.000Z",
    };
    let refreshed = false;
    const fetchMock = vi.fn(async (path: string) => {
      const url = new URL(path, "http://localhost");
      if (url.pathname === "/api/v1/projects") return json(projectPage());
      if (url.searchParams.has("after"))
        return json(clientPage([revoked, expired], null));
      return json(
        refreshed
          ? clientPage([], null, laterCutoff)
          : clientPage([client], cursorId),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<FoundationClientsPanel enabled environment="preview" />);
    await screen.findByRole("option", { name: "Notebook" });
    selectProject();
    await screen.findByText("Notebook reader");
    fireEvent.click(screen.getByRole("button", { name: "Load more clients" }));
    await screen.findByText("Expired reader");
    expect(screen.getByText("Revoked writer")).toBeTruthy();
    expect(screen.getByText("Notebook reader")).toBeTruthy();
    expect(screen.getByText("Revoked", { selector: "span" })).toBeTruthy();
    expect(screen.getByText("Expired", { selector: "span" })).toBeTruthy();
    const request = new URL(fetchMock.mock.calls[2]![0], "http://localhost");
    expect(Object.fromEntries(request.searchParams)).toEqual({
      projectId,
      limit: "25",
      after: cursorId,
      asOf: cutoff,
    });
    const expiry = within(
      screen.getByText("Notebook reader").closest("li")!,
    ).getByText(client.expiresAt, { selector: "time" });
    expect(expiry.getAttribute("datetime")).toBe(client.expiresAt);
    expect(
      screen.queryByRole("button", { name: "Revoke Expired reader" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Revoke Revoked writer" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Load more clients" }),
    ).toBeNull();
    refreshed = true;
    fireEvent.click(screen.getByRole("button", { name: "Refresh clients" }));
    await screen.findByText("No clients for this project.");
    const refresh = new URL(fetchMock.mock.calls[3]![0], "http://localhost");
    expect(Object.fromEntries(refresh.searchParams)).toEqual({
      projectId,
      limit: "25",
    });
    expect(screen.getByText(laterCutoff, { selector: "time" })).toBeTruthy();
  });

  it("aborts a changed project's read and ignores stale results even when the transport delivers them", async () => {
    const oldRead = deferred<Response>();
    let oldSignal: AbortSignal | undefined;
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      const url = new URL(path, "http://localhost");
      if (url.pathname === "/api/v1/projects")
        return json(projectPage([project, secondProject]));
      if (url.searchParams.get("projectId") === projectId) {
        oldSignal = init?.signal ?? undefined;
        return oldRead.promise;
      }
      return json(
        clientPage([
          {
            ...client,
            projectId: secondProjectId,
            name: "Second project's client",
          },
        ]),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<FoundationClientsPanel enabled environment="preview" />);
    await screen.findByRole("option", { name: "Second project" });
    selectProject();
    expect(screen.getByText("Loading clients...")).toBeTruthy();
    selectProject(secondProjectId);
    await screen.findByText("Second project's client");
    expect(oldSignal?.aborted).toBe(true);
    await act(async () =>
      oldRead.resolve(json(clientPage([client], cursorId))),
    );
    expect(screen.queryByText("Notebook reader")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Load more clients" }),
    ).toBeNull();
    expect(postCalls(fetchMock)).toHaveLength(0);
  });

  it("shows static read errors and retries both initial and continuation pages without losing scope", async () => {
    let projectAttempt = 0;
    let clientAttempt = 0;
    let continuationAttempt = 0;
    const fetchMock = vi.fn(async (path: string) => {
      const url = new URL(path, "http://localhost");
      if (url.pathname === "/api/v1/projects")
        return ++projectAttempt === 1
          ? json({ error: "private server detail" }, 500)
          : json(projectPage());
      if (url.searchParams.has("after"))
        return ++continuationAttempt === 1
          ? json({ items: "bad shape" })
          : json(
              clientPage([{ ...client, id: cursorId, name: "Later client" }]),
            );
      return ++clientAttempt === 1
        ? json({ error: "private server detail" }, 500)
        : json(clientPage([client], cursorId));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<FoundationClientsPanel enabled environment="preview" />);
    await screen.findByText("Could not load projects.");
    expect(screen.queryByText(/private server detail/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry projects" }));
    await screen.findByRole("option", { name: "Notebook" });
    selectProject();
    await screen.findByRole("button", { name: "Retry clients" });
    fireEvent.click(screen.getByRole("button", { name: "Retry clients" }));
    await screen.findByText("Notebook reader");
    fireEvent.click(screen.getByRole("button", { name: "Load more clients" }));
    await screen.findByRole("button", { name: "Retry clients" });
    expect(screen.getByText("Notebook reader")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry clients" }));
    await screen.findByText("Later client");
    const continuations = fetchMock.mock.calls
      .map(([path]) => new URL(path, "http://localhost"))
      .filter((url) => url.searchParams.has("after"));
    expect(continuations).toHaveLength(2);
    expect(continuations[0]!.search).toBe(continuations[1]!.search);
    expect((screen.getByLabelText("Project") as HTMLSelectElement).value).toBe(
      projectId,
    );
  });

  it("shows an empty project state without choosing authority or issuing anything", async () => {
    const fetchMock = vi.fn(async () => json(projectPage([])));
    vi.stubGlobal("fetch", fetchMock);
    render(<FoundationClientsPanel enabled environment="local" />);
    await screen.findByText("No projects are available.");
    expect(
      (screen.getByLabelText("Project") as HTMLSelectElement).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Create client",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("issues one strictly scoped client with explicit writes, fixed environment and chosen lifetime, preserving the secret on read failure", async () => {
    const issuance = deferred<Response>();
    const clipboard = vi
      .fn()
      .mockRejectedValueOnce(new Error("private clipboard failure"))
      .mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: clipboard },
    });
    const storage = vi.spyOn(Storage.prototype, "setItem");
    const key = "0ef5d360-5d30-4863-a148-b4e4ba020301";
    vi.spyOn(crypto, "randomUUID").mockReturnValue(key);
    let reads = 0;
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      if (init?.method === "POST") return issuance.promise;
      if (path.startsWith("/api/v1/projects")) return json(projectPage());
      return ++reads === 1
        ? json(clientPage())
        : json({ secret: "private database failure" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<FoundationClientsPanel enabled environment="test" />);
    await readyForCreation();
    expect(
      screen.getByText(
        "All client statuses in test are included. Load more to continue through this project's clients.",
      ),
    ).toBeTruthy();
    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(checkboxes).toHaveLength(8);
    expect(
      (screen.getByLabelText("work.propose") as HTMLInputElement).checked,
    ).toBe(false);
    expect(
      (screen.getByLabelText("work.read") as HTMLInputElement).checked,
    ).toBe(false);
    expect(
      (screen.getByLabelText("foundation.read") as HTMLInputElement).checked,
    ).toBe(true);
    expect(checkboxes.filter((checkbox) => checkbox.checked)).toHaveLength(1);
    expect(screen.queryByLabelText("instruction.approve")).toBeNull();
    expect(screen.queryByLabelText("memory.review")).toBeNull();
    expect(screen.queryByLabelText("memory.verify")).toBeNull();
    const lifetime = screen.getByLabelText("Lifetime") as HTMLSelectElement;
    expect(lifetime.value).toBe("86400");
    expect([...lifetime.options].map((option) => option.value)).toEqual([
      "3600",
      "86400",
      "604800",
      "2592000",
    ]);
    fireEvent.change(screen.getByLabelText("Client name"), {
      target: { value: "  Deliberate writer  " },
    });
    fireEvent.click(screen.getByLabelText("memory.propose"));
    fireEvent.change(lifetime, { target: { value: "604800" } });
    submit();
    submit();
    expect(postCalls(fetchMock)).toHaveLength(1);
    expect(
      (screen.getByLabelText("Project") as HTMLSelectElement).disabled,
    ).toBe(true);
    expect(screen.getByLabelText("Client name").matches(":disabled")).toBe(
      true,
    );
    const post = postCalls(fetchMock)[0]!;
    const init = post[1] as RequestInit;
    expect(post[0]).toBe("/api/v1/foundation/clients");
    expect(JSON.parse(String(init.body))).toEqual({
      name: "Deliberate writer",
      projectId,
      operations: ["foundation.read", "memory.propose"],
      environment: "test",
      ttlSeconds: 604800,
    });
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    });
    await act(async () =>
      issuance.resolve(
        json(
          issuedBody({
            ...client,
            environment: "test",
            operations: ["foundation.read", "memory.propose"],
          }),
          201,
        ),
      ),
    );
    const credential = (await screen.findByLabelText(
      "One-time credential",
    )) as HTMLTextAreaElement;
    expect(credential.value).toBe(token);
    await screen.findByRole("button", { name: "Retry clients" });
    expect(
      (screen.getByLabelText("One-time credential") as HTMLTextAreaElement)
        .value,
    ).toBe(token);
    expect(clipboard).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
    expect(window.location.href).not.toContain(token);
    expect(
      screen.getByText(window.location.origin + "/mcp/foundation/" + projectId),
    ).toBeTruthy();
    for (const message of [
      ...screen.getAllByRole("status"),
      ...screen.getAllByRole("alert"),
    ])
      expect(message.textContent).not.toContain(token);
    expect(screen.queryByText(/private database failure/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Copy credential" }));
    await screen.findByText(
      "Could not copy. Select and copy the credential manually.",
    );
    expect(credential.value).toBe(token);
    fireEvent.click(screen.getByRole("button", { name: "Copy credential" }));
    await screen.findByText("Credential copied.");
    expect(clipboard).toHaveBeenLastCalledWith(token);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss credential" }));
    expect(screen.queryByLabelText("One-time credential")).toBeNull();
    expect(screen.queryByDisplayValue(token)).toBeNull();
    view.unmount();
    render(<FoundationClientsPanel enabled environment="test" />);
    await screen.findByRole("option", { name: "Notebook" });
    expect(screen.queryByLabelText("One-time credential")).toBeNull();
    expect(postCalls(fetchMock)).toHaveLength(1);
  });

  it("validates empty capability selection and warns on uncertain issuance without an automatic retry", async () => {
    let count = 0;
    vi.spyOn(crypto, "randomUUID").mockImplementation(() =>
      ++count === 1
        ? "0ef5d360-5d30-4863-a148-b4e4ba020301"
        : "0ef5d360-5d30-4863-a148-b4e4ba020302",
    );
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      if (init?.method === "POST")
        return json({ error: "database connection private" }, 500);
      return json(
        path.startsWith("/api/v1/projects") ? projectPage() : clientPage(),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<FoundationClientsPanel enabled environment="production" />);
    await readyForCreation();
    fireEvent.click(screen.getByLabelText("foundation.read"));
    submit();
    await screen.findByText(/Choose a project, enter a client name/);
    expect(postCalls(fetchMock)).toHaveLength(0);
    fireEvent.click(screen.getByLabelText("foundation.read"));
    submit();
    await screen.findByText(/Issuance could not be confirmed/);
    expect(postCalls(fetchMock)).toHaveLength(1);
    expect(
      (
        screen.getByRole("button", {
          name: "Create client",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(screen.queryByText(/database connection private/)).toBeNull();
    expect(screen.queryByLabelText("One-time credential")).toBeNull();
    submit();
    expect(postCalls(fetchMock)).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Refresh clients" }));
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Create client",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    submit();
    await waitFor(() => expect(postCalls(fetchMock)).toHaveLength(2));
    const keys = postCalls(fetchMock).map(
      (call) => (call[1] as RequestInit).headers,
    );
    expect(keys[0]).not.toEqual(keys[1]);
  });

  it("requires named inline revoke confirmation and applies the validated response without a background write", async () => {
    const revocation = deferred<Response>();
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      if (init?.method === "POST") return revocation.promise;
      return json(
        path.startsWith("/api/v1/projects")
          ? projectPage([project, secondProject])
          : clientPage([client]),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<FoundationClientsPanel enabled environment="preview" />);
    await screen.findByRole("option", { name: "Notebook" });
    selectProject();
    const revokeButton = await screen.findByRole("button", {
      name: "Revoke Notebook reader",
    });
    expect(postCalls(fetchMock)).toHaveLength(0);
    fireEvent.click(revokeButton);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Confirm revoke" }),
    );
    expect(
      screen.getByRole("group", { name: "Revoke Notebook reader" }).textContent,
    ).toContain("Revoke Notebook reader?");
    expect(postCalls(fetchMock)).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Revoke Notebook reader" }),
    );
    expect(screen.queryByRole("button", { name: "Confirm revoke" })).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Revoke Notebook reader" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm revoke" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm revoke" }));
    expect(postCalls(fetchMock)).toHaveLength(1);
    expect(
      (screen.getByLabelText("Project") as HTMLSelectElement).disabled,
    ).toBe(true);
    const post = postCalls(fetchMock)[0]!;
    expect(post[0]).toBe("/api/v1/foundation/clients/" + client.id + "/revoke");
    expect(post[1]).toEqual({ method: "POST", credentials: "same-origin" });
    await act(async () =>
      revocation.resolve(json({ ...client, revokedAt: cutoff })),
    );
    await screen.findByText("Client revoked.");
    const row = screen.getByText("Notebook reader").closest("li")!;
    expect(within(row).getByText("Revoked", { selector: "span" })).toBeTruthy();
    expect(
      within(row)
        .getByText(cutoff, { selector: "time" })
        .getAttribute("datetime"),
    ).toBe(cutoff);
    expect(screen.queryByRole("button", { name: "Confirm revoke" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Revoke Notebook reader" }),
    ).toBeNull();
    expect(postCalls(fetchMock)).toHaveLength(1);
  });

  it("clears confirmation and one-time credentials on scope changes, and discards late issuance after disabling", async () => {
    const lateIssuance = deferred<Response>();
    let postCount = 0;
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      if (init?.method === "POST")
        return ++postCount === 1 ? json(issuedBody()) : lateIssuance.promise;
      const url = new URL(path, "http://localhost");
      if (url.pathname === "/api/v1/projects")
        return json(projectPage([project, secondProject]));
      return json(
        clientPage([
          {
            ...client,
            projectId: url.searchParams.get("projectId")!,
            name:
              url.searchParams.get("projectId") === projectId
                ? client.name
                : "Second reader",
          },
        ]),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const view = render(
      <FoundationClientsPanel enabled environment="preview" />,
    );
    await screen.findByRole("option", { name: "Notebook" });
    selectProject();
    fireEvent.click(
      await screen.findByRole("button", { name: "Revoke Notebook reader" }),
    );
    selectProject(secondProjectId);
    await screen.findByText("Second reader");
    expect(screen.queryByRole("button", { name: "Confirm revoke" })).toBeNull();
    selectProject();
    await screen.findByText("Notebook reader");
    fireEvent.change(screen.getByLabelText("Client name"), {
      target: { value: "New reader" },
    });
    submit();
    await screen.findByLabelText("One-time credential");
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Project") as HTMLSelectElement).disabled,
      ).toBe(false),
    );
    selectProject(secondProjectId);
    await screen.findByText("Second reader");
    expect(screen.queryByLabelText("One-time credential")).toBeNull();
    expect(screen.queryByDisplayValue(token)).toBeNull();
    fireEvent.change(screen.getByLabelText("Client name"), {
      target: { value: "Late reader" },
    });
    submit();
    expect(postCalls(fetchMock)).toHaveLength(2);
    view.rerender(
      <FoundationClientsPanel enabled={false} environment="preview" />,
    );
    const callCount = fetchMock.mock.calls.length;
    await act(async () =>
      lateIssuance.resolve(
        json(issuedBody({ ...client, projectId: secondProjectId })),
      ),
    );
    expect(screen.queryByLabelText("One-time credential")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(callCount);
    expect(screen.getByText(/Sign in with the owner password/)).toBeTruthy();
  });
  it("rejects mismatched project metadata and issuance scope without displaying response credentials", async () => {
    let reads = 0;
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      if (init?.method === "POST")
        return json(issuedBody({ ...client, environment: "production" }));
      if (path.startsWith("/api/v1/projects")) return json(projectPage());
      return json(
        clientPage(
          ++reads === 1 ? [{ ...client, projectId: secondProjectId }] : [],
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<FoundationClientsPanel enabled environment="preview" />);
    await screen.findByRole("option", { name: "Notebook" });
    selectProject();
    fireEvent.click(
      await screen.findByRole("button", { name: "Retry clients" }),
    );
    await screen.findByText("No clients for this project.");
    expect(screen.queryByText("Notebook reader")).toBeNull();
    submit();
    await screen.findByText(/Choose a project, enter a client name/);
    expect(postCalls(fetchMock)).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("Client name"), {
      target: { value: "Scoped client" },
    });
    submit();
    await screen.findByText(/Issuance could not be confirmed/);
    expect(screen.queryByLabelText("One-time credential")).toBeNull();
    expect(screen.queryByDisplayValue(token)).toBeNull();
    expect(document.body.textContent).not.toContain(token);
    expect(postCalls(fetchMock)).toHaveLength(1);
  });
});
