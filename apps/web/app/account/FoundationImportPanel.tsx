"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  entityIdSchema,
  foundationAliasSchema,
  foundationEvidenceInputSchema,
  foundationMemoryContentSchema,
  projectSummarySchema,
} from "@commandry/contracts";
import type {
  MnemosyneImportEnvelope,
  MnemosyneImportPlan,
  MnemosyneSelectedImportInput,
  FoundationImportReceipt,
} from "@commandry/application";
import styles from "./FoundationImportPanel.module.css";

type Props = {
  enabled: boolean;
  environment: "local" | "test" | "preview" | "production";
};
type Row = MnemosyneImportPlan["records"][number];
type BoundPreview = { plan: MnemosyneImportPlan; projectName: string };
type Snapshot = {
  key: string;
  body: string;
  envelope: MnemosyneImportEnvelope;
  rows: Row[];
};
type SafeReceipt = {
  id: string;
  replayed: boolean;
  projectId: string;
  records: Pick<
    FoundationImportReceipt["records"][number],
    "memoryId" | "version" | "action" | "importRevisionId"
  >[];
};
const maximumBytes = 8 * 1024 * 1024;
const applyBudgetMessage =
  "The reviewed import request exceeds the 8 MiB request budget. Split the export into smaller files containing whole records, then replace the file and preview again. Keep every original complete.";
const recordPageSize = 20;
const sourcePageSize = 10;
const digestPattern = /^[a-f0-9]{64}$/;

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid structure");
  return value as Record<string, unknown>;
}
function exact(value: unknown, keys: string[]) {
  const result = object(value);
  if (
    Object.keys(result).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(result, key))
  )
    throw new Error("Invalid fields");
  return result;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return (
      "{" +
      Object.keys(record)
        .sort()
        .map((key) => JSON.stringify(key) + ":" + canonical(record[key]))
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(value);
}
async function digest(value: unknown) {
  const bytes = new TextEncoder().encode(canonical(value));
  const result = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(result), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
function parseEnvelope(value: unknown): MnemosyneImportEnvelope {
  const e = exact(value, [
    "schemaVersion",
    "projectId",
    "namespace",
    "records",
  ]);
  if (
    e.schemaVersion !== 1 ||
    !Array.isArray(e.records) ||
    e.records.length > 1000
  )
    throw new Error("Invalid export");
  const projectId = entityIdSchema.parse(e.projectId);
  const namespace = foundationAliasSchema.shape.namespace.parse(e.namespace);
  const aliases = new Set<string>();
  let sourceCount = 0;
  const records = e.records.map((value) => {
    const r = exact(value, [
      "externalId",
      "knowledgeItemId",
      "statement",
      "category",
      "sourceTier",
      "selected",
      "sources",
    ]);
    const externalId = foundationAliasSchema.shape.externalId.parse(
      r.externalId,
    );
    if (aliases.has(externalId)) throw new Error("Duplicate alias");
    aliases.add(externalId);
    if (
      typeof r.selected !== "boolean" ||
      !["public", "private", "client", "unknown"].includes(
        String(r.sourceTier),
      ) ||
      !Array.isArray(r.sources) ||
      r.sources.length < 1
    )
      throw new Error("Invalid record");
    sourceCount += r.sources.length;
    if (sourceCount > 1000) throw new Error("Too many sources");
    const sources = r.sources.map((value) => {
      const s = exact(value, ["evidence", "originalContent"]);
      const evidence = foundationEvidenceInputSchema.parse(s.evidence);
      if (
        canonical(evidence) !== canonical(s.evidence) ||
        evidence.projectId !== projectId ||
        (s.originalContent !== null && typeof s.originalContent !== "string") ||
        (evidence.availability === "available") !== (s.originalContent !== null)
      )
        throw new Error("Invalid source");
      return { evidence, originalContent: s.originalContent as string | null };
    });
    return {
      externalId,
      knowledgeItemId: entityIdSchema.parse(r.knowledgeItemId),
      statement: foundationMemoryContentSchema.shape.statement.parse(
        r.statement,
      ),
      category: foundationMemoryContentSchema.shape.category.parse(r.category),
      sourceTier:
        r.sourceTier as MnemosyneImportEnvelope["records"][number]["sourceTier"],
      selected: r.selected,
      sources,
    };
  });
  const parsed: MnemosyneImportEnvelope = {
    schemaVersion: 1,
    projectId,
    namespace,
    records,
  };
  if (canonical(parsed) !== canonical(value)) throw new Error("Changed export");
  return parsed;
}
async function bindPreview(
  raw: unknown,
  e: MnemosyneImportEnvelope,
): Promise<MnemosyneImportPlan> {
  const p = exact(raw, [
    "schemaVersion",
    "projectId",
    "namespace",
    "sideEffects",
    "existingCount",
    "records",
  ]);
  if (
    p.schemaVersion !== 1 ||
    p.projectId !== e.projectId ||
    p.namespace !== e.namespace ||
    p.sideEffects !== "none" ||
    !Number.isSafeInteger(p.existingCount) ||
    (p.existingCount as number) < 0 ||
    !Array.isArray(p.records) ||
    p.records.length !== e.records.length
  )
    throw new Error("Invalid preview");
  const records: Row[] = [];
  for (let index = 0; index < e.records.length; index += 1) {
    const r = e.records[index]!;
    const row = exact(p.records[index], [
      "alias",
      "knowledgeItemId",
      "category",
      "sourceTier",
      "selected",
      "statement",
      "selectionFingerprint",
      "sourceFingerprint",
      "reviewedSelection",
      "sources",
      "originalsAvailable",
      "expectedExistingMemory",
      "action",
      "reason",
    ]);
    const { selected: ignoredSelection, ...sourceRecord } = r;
    void ignoredSelection;
    const scope = {
      schemaVersion: e.schemaVersion,
      projectId: e.projectId,
      namespace: e.namespace,
    };
    const selectionFingerprint = await digest({ ...scope, record: r });
    const sourceFingerprint = await digest({ ...scope, record: sourceRecord });
    const available = r.sources.every(
      (source) => source.originalContent !== null,
    );
    const expectedStatement = r.sourceTier === "public" ? r.statement : null;
    if (
      canonical(row.alias) !==
        canonical({ namespace: e.namespace, externalId: r.externalId }) ||
      row.knowledgeItemId !== r.knowledgeItemId ||
      row.category !== r.category ||
      row.sourceTier !== r.sourceTier ||
      row.selected !== r.selected ||
      row.statement !== expectedStatement ||
      row.selectionFingerprint !== selectionFingerprint ||
      row.sourceFingerprint !== sourceFingerprint ||
      row.reviewedSelection !== false ||
      row.originalsAvailable !== available ||
      canonical(row.sources) !==
        canonical(r.sources.map((source) => source.evidence))
    )
      throw new Error("Preview binding mismatch");
    const prior = row.expectedExistingMemory;
    if (prior !== null) {
      const baseline = exact(prior, [
        "id",
        "version",
        "contentDigest",
        "knowledgeItemId",
      ]);
      entityIdSchema.parse(baseline.id);
      entityIdSchema.parse(baseline.knowledgeItemId);
      if (
        !Number.isSafeInteger(baseline.version) ||
        (baseline.version as number) < 1 ||
        !digestPattern.test(String(baseline.contentDigest))
      )
        throw new Error("Invalid baseline");
    }
    const validClassification = !r.selected
      ? row.action === "unselected" && row.reason === "not_selected"
      : row.action === "disclosure_review_required"
        ? row.reason === "exact_selection_review_missing" &&
          (prior === null || r.sourceTier !== "public")
        : row.action === "preserve_owner_changes"
          ? prior !== null && row.reason === "owner_content_changed"
          : !available
            ? row.action === "unavailable_source" &&
              row.reason === "original_unavailable"
            : prior !== null &&
              ((row.action === "unchanged" &&
                row.reason === "same_import_and_owner_baseline") ||
                (row.action === "revision_requires_review" &&
                  [
                    "baseline_unavailable",
                    "knowledge_item_changed",
                    "import_changed",
                  ].includes(String(row.reason))));
    if (!validClassification) throw new Error("Invalid action");
    records.push(row as Row);
  }
  return {
    schemaVersion: 1,
    projectId: e.projectId,
    namespace: e.namespace,
    sideEffects: "none",
    existingCount: p.existingCount as number,
    records,
  };
}
function knowledgeDestinationMismatch(row: Row) {
  return (
    row.expectedExistingMemory !== null &&
    row.expectedExistingMemory.knowledgeItemId !== row.knowledgeItemId
  );
}
function canReview(row: Row) {
  return (
    row.selected &&
    row.originalsAvailable &&
    !knowledgeDestinationMismatch(row) &&
    (row.action === "disclosure_review_required" ||
      row.action === "unchanged" ||
      (row.action === "revision_requires_review" &&
        row.reason === "import_changed"))
  );
}
function reasonText(row: Row) {
  if (knowledgeDestinationMismatch(row))
    return "Knowledge destination mismatch: this alias already belongs to a different Knowledge item. Reconcile the destination before preparing a new export and previewing again; importing cannot retarget the alias.";
  switch (row.reason) {
    case "not_selected":
      return "Not selected in this export.";
    case "owner_content_changed":
      return "Owner edits are preserved. Reconcile them before preparing another export.";
    case "original_unavailable":
      return "An original is unavailable. Supply all exact originals and preview again.";
    case "baseline_unavailable":
      return "Import baseline is missing. Resolve the baseline before previewing again.";
    case "knowledge_item_changed":
      return "Knowledge destination changed. Resolve it and preview again.";
    case "import_changed":
      return "Changed import: explicit review will create a proposed, unverified revision.";
    case "same_import_and_owner_baseline":
      return "Unchanged import: explicit review is still required.";
    default:
      return "Explicit review is required. Import creates proposed, unverified memory.";
  }
}
function safeReceipt(raw: unknown, snapshot: Snapshot): SafeReceipt {
  const response = exact(raw, ["record", "replayed", "correlationId"]);
  const receipt = exact(response.record, [
    "schemaVersion",
    "id",
    "projectId",
    "namespace",
    "appliedBy",
    "recordedAt",
    "records",
  ]);
  const id = entityIdSchema.parse(receipt.id);
  if (
    receipt.schemaVersion !== 1 ||
    receipt.projectId !== snapshot.envelope.projectId ||
    receipt.namespace !== snapshot.envelope.namespace ||
    response.correlationId !== id ||
    typeof response.replayed !== "boolean" ||
    typeof receipt.appliedBy !== "string" ||
    receipt.appliedBy.length > 200 ||
    typeof receipt.recordedAt !== "string" ||
    !Number.isFinite(Date.parse(receipt.recordedAt)) ||
    !Array.isArray(receipt.records) ||
    receipt.records.length !== snapshot.rows.length
  )
    throw new Error("Invalid receipt");
  const memoryIds = new Set<string>();
  const revisionIds = new Set<string>();
  const records = receipt.records.map((value, index) => {
    const summary = exact(value, [
      "externalId",
      "sourceTier",
      "sourceFingerprint",
      "selectionFingerprint",
      "action",
      "memoryId",
      "version",
      "contentDigest",
      "importRevisionId",
      "sourceCount",
    ]);
    const row = snapshot.rows[index]!;
    const memoryId = entityIdSchema.parse(summary.memoryId);
    const importRevisionId = entityIdSchema.parse(summary.importRevisionId);
    const prior = row.expectedExistingMemory;
    const expectedAction: FoundationImportReceipt["records"][number]["action"] =
      prior === null
        ? "created"
        : row.action === "unchanged" ||
            (row.action === "disclosure_review_required" &&
              summary.action === "unchanged")
          ? "unchanged"
          : "revised";
    const expectedVersion =
      prior === null
        ? 1
        : prior.version + (expectedAction === "revised" ? 1 : 0);
    if (
      summary.externalId !== row.alias.externalId ||
      summary.sourceTier !== row.sourceTier ||
      summary.sourceFingerprint !== row.sourceFingerprint ||
      summary.selectionFingerprint !== row.selectionFingerprint ||
      summary.sourceCount !== row.sources.length ||
      summary.action !== expectedAction ||
      summary.version !== expectedVersion ||
      !digestPattern.test(String(summary.contentDigest)) ||
      (prior !== null && memoryId !== prior.id) ||
      (expectedAction === "unchanged" &&
        summary.contentDigest !== prior?.contentDigest) ||
      memoryIds.has(memoryId) ||
      revisionIds.has(importRevisionId)
    )
      throw new Error("Receipt mismatch");
    memoryIds.add(memoryId);
    revisionIds.add(importRevisionId);
    return {
      memoryId,
      importRevisionId,
      action: expectedAction,
      version: expectedVersion,
    };
  });
  return {
    id,
    replayed: response.replayed,
    projectId: snapshot.envelope.projectId,
    records,
  };
}
function readBytes(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === "function") return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      reader.result instanceof ArrayBuffer
        ? resolve(reader.result)
        : reject(new Error("Unreadable file"));
    reader.onerror = () => reject(new Error("Unreadable file"));
    reader.readAsArrayBuffer(file);
  });
}

export default function FoundationImportPanel({ enabled, environment }: Props) {
  if (!enabled)
    return (
      <section
        className={"cmd-workspace-section " + styles.panel}
        aria-labelledby="foundation-import-title"
      >
        <h2 id="foundation-import-title">Selected memory import</h2>
        <p>
          Sign in with the owner password to review and import a selected memory
          export.
        </p>
      </section>
    );
  return <OwnerImport key={environment} environment={environment} />;
}
function OwnerImport({ environment }: Pick<Props, "environment">) {
  const [envelope, setEnvelope] = useState<MnemosyneImportEnvelope | null>(
    null,
  );
  const [preview, setPreview] = useState<BoundPreview | null>(null);
  const [reviews, setReviews] = useState<Set<string>>(new Set());
  const [confirmation, setConfirmation] = useState(false);
  const [pending, setPending] = useState<"read" | "preview" | "apply" | null>(
    null,
  );
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [receipt, setReceipt] = useState<SafeReceipt | null>(null);
  const [page, setPage] = useState(0);
  const [fileVersion, setFileVersion] = useState(0);
  const alive = useRef(true);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const snapshot = useRef<Snapshot | null>(null);
  const prepared = useMemo(() => {
    if (!preview || !envelope) return null;
    const rows = preview.plan.records.filter((row) => row.selected);
    const input: MnemosyneSelectedImportInput = {
      envelope,
      decision: "apply_proposed_unverified",
      reviewedSelections: rows.map((row) => ({
        externalId: row.alias.externalId,
        selectionFingerprint: row.selectionFingerprint,
        expectedExistingMemory: row.expectedExistingMemory,
      })),
    };
    const body = JSON.stringify(input);
    return {
      envelope,
      rows,
      body,
      byteLength: new TextEncoder().encode(body).byteLength,
    };
  }, [envelope, preview]);
  const overBudget = prepared !== null && prepared.byteLength > maximumBytes;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current += 1;
      controller.current?.abort();
      snapshot.current = null;
    };
  }, []);
  function resetReview() {
    setPreview(null);
    setReviews(new Set());
    setConfirmation(false);
    setUncertain(false);
    snapshot.current = null;
  }
  async function loadFile(file: File | undefined) {
    if (busy.current || uncertain) return;
    const request = ++generation.current;
    controller.current?.abort();
    resetReview();
    setEnvelope(null);
    setReceipt(null);
    setError("");
    setPage(0);
    setPending(null);
    if (!file) {
      setPending(null);
      return;
    }
    if (file.size > maximumBytes) {
      setError("Choose a closed JSON export no larger than 8 MiB.");
      return;
    }
    setPending("read");
    try {
      const bytes = await readBytes(file);
      if (bytes.byteLength > maximumBytes) throw new Error("File size changed");
      const text = new TextDecoder("utf-8", {
        fatal: true,
        ignoreBOM: true,
      }).decode(bytes);
      const value = parseEnvelope(
        JSON.parse(text.startsWith("\uFEFF") ? text.slice(1) : text),
      );
      if (alive.current && generation.current === request) setEnvelope(value);
    } catch {
      if (alive.current && generation.current === request)
        setError(
          "Could not read this export. Use valid UTF-8 JSON with at most 1000 records and 1000 total sources.",
        );
    } finally {
      if (alive.current && generation.current === request) setPending(null);
    }
  }
  async function previewImport() {
    if (!envelope || busy.current || uncertain || pending === "read") return;
    const currentEnvelope = envelope;
    const request = ++generation.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    resetReview();
    setPending("preview");
    setError("");
    const current = () =>
      alive.current && generation.current === request && !abort.signal.aborted;
    try {
      const projectResponse = await fetch(
        "/api/v1/projects/" + encodeURIComponent(currentEnvelope.projectId),
        { credentials: "same-origin", cache: "no-store", signal: abort.signal },
      );
      if (!projectResponse.ok) throw new Error("Project unavailable");
      const project = projectSummarySchema.parse(await projectResponse.json());
      if (project.id !== currentEnvelope.projectId)
        throw new Error("Project mismatch");
      if (!current()) return;
      const response = await fetch("/api/v1/foundation/imports/preview", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        signal: abort.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(currentEnvelope),
      });
      if (!response.ok) throw new Error("Preview unavailable");
      const plan = await bindPreview(await response.json(), currentEnvelope);
      if (current()) {
        setPreview({ plan, projectName: project.name });
        setPage(0);
      }
    } catch {
      if (current())
        setError(
          "Could not validate this preview and destination. Check the export and preview again.",
        );
    } finally {
      if (current()) setPending(null);
    }
  }
  async function applyImport(retry = false) {
    if (busy.current || !preview || !envelope || !prepared) return;
    let decision = snapshot.current;
    const selectedRows = preview.plan.records.filter((row) => row.selected);
    if (!retry) {
      if (
        !confirmation ||
        uncertain ||
        overBudget ||
        selectedRows.length === 0 ||
        selectedRows.some(
          (row) => !canReview(row) || !reviews.has(row.alias.externalId),
        )
      )
        return;
      try {
        decision = {
          key: crypto.randomUUID(),
          body: prepared.body,
          envelope: prepared.envelope,
          rows: prepared.rows,
        };
        snapshot.current = decision;
      } catch {
        setError("Could not prepare a secure import request in this browser.");
        return;
      }
    } else if (!uncertain || !decision) return;
    if (!decision) return;
    const exactDecision = decision;
    if (
      new TextEncoder().encode(exactDecision.body).byteLength > maximumBytes
    ) {
      resetReview();
      setError(applyBudgetMessage);
      return;
    }
    busy.current = true;
    setPending("apply");
    setError("");
    const request = generation.current;
    const abort = new AbortController();
    controller.current = abort;
    const current = () =>
      alive.current && generation.current === request && !abort.signal.aborted;
    try {
      const response = await fetch("/api/v1/foundation/imports/apply", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        signal: abort.signal,
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": exactDecision.key,
        },
        body: exactDecision.body,
      });
      if (response.status === 413) {
        const failure = object(await response.json());
        if (failure.code === "PAYLOAD_TOO_LARGE") {
          if (current()) {
            resetReview();
            setError(applyBudgetMessage);
          }
          return;
        }
        throw new Error("Unconfirmed rejection");
      }
      if (response.status === 401) {
        if (current()) {
          setUncertain(true);
          setConfirmation(false);
          setError(
            "Import outcome is uncertain. Owner sign-in may have expired after the import committed. Sign in again in another tab while keeping this review page open, then retry this exact reviewed request with the same key. No automatic retry has occurred.",
          );
        }
        return;
      }
      if ([400, 403, 404, 409, 422].includes(response.status)) {
        if (current()) {
          resetReview();
          setError(
            "Import was rejected or the baseline changed. Preview again and review every selected record before a new decision.",
          );
        }
        return;
      }
      if (!response.ok) throw new Error("Unconfirmed import");
      const result = safeReceipt(await response.json(), exactDecision);
      if (!current()) return;
      resetReview();
      setEnvelope(null);
      setReceipt(result);
      setFileVersion((value) => value + 1);
      setPage(0);
    } catch {
      if (current()) {
        setUncertain(true);
        setConfirmation(false);
        setError(
          "Import outcome is uncertain. Retry this exact reviewed request with the same key; no automatic retry has occurred.",
        );
      }
    } finally {
      busy.current = false;
      if (current()) setPending(null);
    }
  }
  const selected = preview?.plan.records.filter((row) => row.selected) ?? [];
  const ready =
    selected.length > 0 &&
    !overBudget &&
    selected.every(
      (row) => canReview(row) && reviews.has(row.alias.externalId),
    );
  return (
    <section
      className={"cmd-workspace-section " + styles.panel}
      aria-labelledby="foundation-import-title"
    >
      <h2 id="foundation-import-title">Selected memory import</h2>
      <p>
        Choose an explicit closed JSON export. Review disclosure for every
        selected record, including public sources. Imports remain proposed and
        unverified; review does not approve instructions or verify facts.
      </p>
      <div className={styles.field}>
        <label htmlFor="foundation-import-file">Closed export JSON file</label>
        <input
          key={fileVersion}
          id="foundation-import-file"
          type="file"
          accept=".json,application/json"
          disabled={pending === "apply" || uncertain}
          onChange={(event) => void loadFile(event.target.files?.[0])}
        />
      </div>
      <p className={styles.hint}>
        At most 8 MiB, 1000 records and 1000 total sources. File content stays
        in this component until sent to preview or import. No files, paths or
        links inside it are opened.
      </p>
      {envelope && (
        <>
          <p>
            Export destination ID: {envelope.projectId}. Namespace:{" "}
            {envelope.namespace}. Environment: {environment}.{" "}
            {envelope.records.length} records,{" "}
            {envelope.records.filter((row) => row.selected).length} selected.
          </p>
          <button
            type="button"
            className={styles.selfStart}
            disabled={pending !== null || uncertain}
            onClick={() => void previewImport()}
          >
            Preview selected import
          </button>
        </>
      )}
      {pending && (
        <p role="status">
          {pending === "read"
            ? "Reading selected file..."
            : pending === "preview"
              ? "Validating destination and preview..."
              : "Importing reviewed proposals..."}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {overBudget && <p role="alert">{applyBudgetMessage}</p>}
      {preview && envelope && (
        <>
          <h3>Review destination: {preview.projectName}</h3>
          <dl className={styles.metadata}>
            <dt>Project ID</dt>
            <dd>{envelope.projectId}</dd>
            <dt>Environment</dt>
            <dd>{environment}</dd>
            <dt>Namespace</dt>
            <dd>{envelope.namespace}</dd>
            <dt>Selected records</dt>
            <dd>{selected.length}</dd>
          </dl>
          <p className={styles.hint}>
            Fingerprints identify exact content; they do not authenticate
            sources or record owner approval. Each checkbox affirms this exact
            statement, source tier, destination and originals.
          </p>
          <p>
            Records{" "}
            {preview.plan.records.length === 0 ? 0 : page * recordPageSize + 1}-
            {Math.min((page + 1) * recordPageSize, preview.plan.records.length)}{" "}
            of {preview.plan.records.length}. Reviewed {reviews.size} of{" "}
            {selected.length} selected.
          </p>
          <ol className={styles.records} aria-label="Import records">
            {preview.plan.records
              .slice(page * recordPageSize, (page + 1) * recordPageSize)
              .map((row, offset) => {
                const record =
                  envelope.records[page * recordPageSize + offset]!;
                return (
                  <li className={styles.card} key={row.alias.externalId}>
                    <h4>{row.alias.externalId}</h4>
                    <dl className={styles.metadata}>
                      <dt>Knowledge ID</dt>
                      <dd>{row.knowledgeItemId}</dd>
                      <dt>Category</dt>
                      <dd>{row.category}</dd>
                      <dt>Source tier</dt>
                      <dd>{row.sourceTier}</dd>
                      <dt>Selected</dt>
                      <dd>{row.selected ? "Yes" : "No"}</dd>
                      <dt>Statement</dt>
                      <dd>
                        <pre className={styles.original}>
                          {record.statement}
                        </pre>
                      </dd>
                      <dt>Selection fingerprint</dt>
                      <dd>
                        <code>{row.selectionFingerprint}</code>
                      </dd>
                      <dt>Source fingerprint</dt>
                      <dd>
                        <code>{row.sourceFingerprint}</code>
                      </dd>
                      <dt>Source count</dt>
                      <dd>{record.sources.length}</dd>
                    </dl>
                    <p>{reasonText(row)}</p>
                    <Sources key={row.selectionFingerprint} record={record} />
                    {row.selected && (
                      <label className={styles.checkbox}>
                        <input
                          type="checkbox"
                          aria-label={
                            "Review exact selection " + row.alias.externalId
                          }
                          checked={reviews.has(row.alias.externalId)}
                          disabled={
                            !canReview(row) || pending !== null || uncertain
                          }
                          onChange={(event) => {
                            const checked = event.target.checked;
                            setReviews((previous) => {
                              const next = new Set(previous);
                              if (checked) next.add(row.alias.externalId);
                              else next.delete(row.alias.externalId);
                              return next;
                            });
                            setConfirmation(false);
                            snapshot.current = null;
                          }}
                        />
                        <span>
                          I reviewed the exact selection {row.alias.externalId},
                          its statement, {row.sourceTier} tier, destination and
                          all originals.
                        </span>
                      </label>
                    )}
                  </li>
                );
              })}
          </ol>
          <div className={styles.actions}>
            <button
              type="button"
              disabled={page === 0 || pending === "apply"}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous records
            </button>
            <button
              type="button"
              disabled={
                (page + 1) * recordPageSize >= preview.plan.records.length ||
                pending === "apply"
              }
              onClick={() => setPage((value) => value + 1)}
            >
              Next records
            </button>
          </div>
          {!uncertain && !confirmation && (
            <button
              type="button"
              className={styles.selfStart}
              disabled={!ready || pending !== null}
              onClick={() => setConfirmation(true)}
            >
              Confirm reviewed selection
            </button>
          )}
          {confirmation && (
            <div
              className={styles.confirm}
              role="group"
              aria-label="Confirm selected memory import"
            >
              <p>
                Import {selected.length} selected records into{" "}
                {preview.projectName} ({envelope.projectId}), environment{" "}
                {environment}, namespace {envelope.namespace}, as proposed and
                unverified memory?
              </p>
              <div className={styles.actions}>
                <button
                  type="button"
                  disabled={!ready || pending !== null}
                  onClick={() => void applyImport()}
                >
                  Import as proposals
                </button>
                <button
                  type="button"
                  disabled={pending === "apply"}
                  onClick={() => setConfirmation(false)}
                >
                  Cancel import
                </button>
              </div>
            </div>
          )}
          {uncertain && (
            <button
              type="button"
              className={styles.selfStart}
              disabled={pending !== null}
              onClick={() => void applyImport(true)}
            >
              Retry exact reviewed import
            </button>
          )}
        </>
      )}
      {receipt && (
        <section className={styles.card} aria-label="Import receipt">
          <h3>Import confirmed</h3>
          <p role="status">
            {receipt.replayed
              ? "Original receipt replayed."
              : "Import receipt recorded."}{" "}
            Private file content has been cleared. New or revised memory remains
            proposed and unverified.
          </p>
          <p>Receipt ID: {receipt.id}</p>
          <ol className={styles.records}>
            {receipt.records.map((row) => (
              <li key={row.importRevisionId}>
                <p>
                  {row.action}: memory {row.memoryId}, version {row.version}
                </p>
                <a
                  href={
                    "/foundation/memory/" +
                    encodeURIComponent(row.memoryId) +
                    "?projectId=" +
                    encodeURIComponent(receipt.projectId)
                  }
                >
                  Review assertion
                </a>
                <a
                  href={
                    "/api/v1/foundation/imports/" +
                    encodeURIComponent(row.importRevisionId) +
                    "?projectId=" +
                    encodeURIComponent(receipt.projectId)
                  }
                >
                  Import revision {row.importRevisionId}
                </a>
              </li>
            ))}
          </ol>
        </section>
      )}
    </section>
  );
}
function Sources({
  record,
}: {
  record: MnemosyneImportEnvelope["records"][number];
}) {
  const [page, setPage] = useState(0);
  return (
    <details className={styles.sources}>
      <summary>
        Inspect originals for {record.externalId} ({record.sources.length})
      </summary>
      <p>
        Sources {page * sourcePageSize + 1}-
        {Math.min((page + 1) * sourcePageSize, record.sources.length)} of{" "}
        {record.sources.length}. JSON string view exposes CRLF, NUL and other
        escaped characters without changing the original.
      </p>
      <ol className={styles.sourceList}>
        {record.sources
          .slice(page * sourcePageSize, (page + 1) * sourcePageSize)
          .map((source, offset) => (
            <li className={styles.card} key={page * sourcePageSize + offset}>
              <h4>Source {page * sourcePageSize + offset + 1}</h4>
              <dl className={styles.metadata}>
                {Object.entries(source.evidence).map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{value === null ? "null" : String(value)}</dd>
                  </div>
                ))}
              </dl>
              {source.originalContent === null ? (
                <p>Original unavailable.</p>
              ) : (
                <>
                  <p>Exact original text</p>
                  <pre
                    className={styles.original}
                    aria-label={
                      "Original text " +
                      record.externalId +
                      " source " +
                      (page * sourcePageSize + offset + 1)
                    }
                  >
                    {source.originalContent}
                  </pre>
                  <p>Exact original JSON string</p>
                  <pre
                    className={styles.original}
                    aria-label={
                      "Original JSON " +
                      record.externalId +
                      " source " +
                      (page * sourcePageSize + offset + 1)
                    }
                  >
                    {JSON.stringify(source.originalContent)}
                  </pre>
                </>
              )}
            </li>
          ))}
      </ol>
      <div className={styles.actions}>
        <button
          type="button"
          disabled={page === 0}
          onClick={() => setPage((value) => value - 1)}
        >
          Previous sources for {record.externalId}
        </button>
        <button
          type="button"
          disabled={(page + 1) * sourcePageSize >= record.sources.length}
          onClick={() => setPage((value) => value + 1)}
        >
          Next sources for {record.externalId}
        </button>
      </div>
    </details>
  );
}
