"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  OBSERVATORY_LOGO_MAX_INPUT_BYTES,
  observatoryCatalogueResultSchema,
  observatoryLogoPreviewResultSchema,
  type ObservatoryCatalogueItem,
  type ObservatoryLogoPreviewResult,
} from "@commandry/contracts";
import type { ObservatoryLogoUrl } from "./ObservatoryResourceMark";
import "./observatory-review-controls.css";
import "./observatory-logo-review.css";

type LogoItem = Extract<ObservatoryCatalogueItem, { kind: "logo" }>;
export type ObservatoryLogoReviewClient = {
  /** Owner catalogue of kind "logo" for this resource. */
  loadLogo(resourceId: string): Promise<unknown>;
  preview(input: unknown): Promise<unknown>;
  review(input: unknown): Promise<unknown>;
};
export type ObservatoryLogoReviewProps = {
  resource: { id: string; name: string; kind: string };
  client: ObservatoryLogoReviewClient;
  logoUrl?: ObservatoryLogoUrl | undefined;
  onReviewed: () => void;
};
/** Owner-facing meaning of each safe logo failure code. */
const failures: Record<string, string> = {
  LOGO_UNSUPPORTED_IMAGE:
    "That file is not a PNG, JPEG, WebP or self-contained SVG. SVG files with scripts, declarations or outside references are refused.",
  LOGO_TOO_LARGE: "The logo file is larger than 512 KiB.",
  LOGO_REPOSITORY_NOT_REVIEWED:
    "That repository is not reviewed for this resource. Use its GitHub source binding or canonical GitHub URL.",
  LOGO_SOURCE_NOT_FOUND:
    "GitHub has no file at that path and ref. Check the path and branch.",
  LOGO_SOURCE_UNAUTHORIZED:
    "GitHub refused the read. A private repository needs the server's GitHub token with contents read access.",
  LOGO_SOURCE_UNAVAILABLE:
    "GitHub could not be read just now, or no reader is configured. Try again later or upload the file.",
  LOGO_PROCESSING_UNAVAILABLE:
    "The server cannot process images right now. Try again after it is repaired.",
  VERSION_CONFLICT:
    "The logo changed since you loaded or previewed it. Preview again and review the current version.",
  INPUT_TOO_LARGE: "The logo file is larger than 512 KiB.",
};
/** A client rejects with an error whose string `code` is the server's safe
 * failure code; anything else is reported generically. */
const message = (error: unknown, fallback: string) => {
  const code =
    error && typeof error === "object" && "code" in error
      ? (error as { code: unknown }).code
      : null;
  return typeof code === "string" && Object.hasOwn(failures, code)
    ? failures[code]!
    : fallback;
};
function logoItem(raw: unknown, resourceId: string): LogoItem | null {
  const result = observatoryCatalogueResultSchema.parse(raw);
  if (result.kind !== "logo") throw new Error("Unexpected catalogue kind");
  const items = result.items.filter((item) => item.resourceId === resourceId);
  if (items.length > 1) throw new Error("Duplicate logo record");
  return items[0] ?? null;
}
async function encode(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}
const sourceText = (source: ObservatoryLogoPreviewResult["source"]) =>
  source.kind === "upload"
    ? `Upload ${source.fileName} (${source.originalMediaType}, ${source.originalByteLength} bytes)`
    : `${source.repository} ${source.path} at commit ${source.commitSha} (blob ${source.blobSha}, ${source.originalMediaType})`;

/**
 * Owner review for one repository's logo. Preview shows exactly the PNG the
 * server would store; approval resubmits the same source with that digest.
 */
export function ObservatoryLogoReview({
  resource,
  client,
  logoUrl,
  onReviewed,
}: ObservatoryLogoReviewProps) {
  const [item, setItem] = useState<LogoItem | null | undefined>(undefined),
    [error, setError] = useState<string | null>(null),
    [mode, setMode] = useState<"upload" | "repository_file">("upload"),
    [file, setFile] = useState<File | null>(null),
    [repository, setRepository] = useState(""),
    [path, setPath] = useState(""),
    [ref, setRef] = useState(""),
    [preview, setPreview] = useState<{
      result: ObservatoryLogoPreviewResult;
      input: Record<string, unknown>;
    } | null>(null),
    [evidence, setEvidence] = useState(""),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0),
    [loadFailed, setLoadFailed] = useState(false),
    [fileInput, setFileInput] = useState(0);
  const generation = useRef(0);
  // The parent keys this panel by scope and resource; reload resets state first.
  useEffect(() => {
    let current = true;
    const ticket = ++generation.current;
    void Promise.resolve()
      .then(() => client.loadLogo(resource.id))
      .then((raw) => {
        if (current && generation.current === ticket)
          setItem(logoItem(raw, resource.id));
      })
      .catch(() => {
        // The record stays unknown, so nothing can be approved against it.
        if (current && generation.current === ticket) setLoadFailed(true);
      });
    return () => {
      current = false;
    };
  }, [client, resource.id, reload]);
  async function runPreview(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setPreview(null);
    let input: Record<string, unknown>;
    if (mode === "upload") {
      if (!file) return setError("Choose a logo file to preview.");
      if (file.size > OBSERVATORY_LOGO_MAX_INPUT_BYTES)
        return setError(failures.LOGO_TOO_LARGE!);
      input = {
        kind: "upload",
        fileName: file.name.slice(0, 255) || "logo",
        dataBase64: await encode(file),
      };
    } else {
      if (!repository.trim() || !path.trim())
        return setError("Name the repository (owner/name) and file path.");
      input = {
        kind: "repository_file",
        repository: repository.trim(),
        path: path.trim().replace(/^\/+/, ""),
        ref: ref.trim() || null,
      };
    }
    const ticket = generation.current;
    setBusy(true);
    try {
      const raw = await client.preview({ resourceId: resource.id, input });
      if (generation.current !== ticket) return;
      const result = observatoryLogoPreviewResultSchema.parse(raw);
      if (result.resourceId !== resource.id)
        throw new Error("Preview is for another resource");
      setPreview({ result, input });
    } catch (failure) {
      if (generation.current === ticket)
        setError(message(failure, "The preview could not be produced."));
    } finally {
      // Always release the controls, even if a newer load superseded this one.
      setBusy(false);
    }
  }
  async function submit(active: boolean) {
    if (busy || item === undefined) return;
    const evidenceRefs = evidence
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (!evidenceRefs.length || !note.trim())
      return setError("Add at least one evidence reference and a review note.");
    if (active && !preview)
      return setError("Preview the logo before approving it.");
    const source = preview?.result.source;
    const input = !active
      ? null
      : source?.kind === "repository_file"
        ? {
            kind: "repository_file",
            repository: source.repository,
            path: source.path,
            commitSha: source.commitSha,
          }
        : preview!.input;
    const expectedVersion = item?.version ?? 0;
    const ticket = generation.current;
    setBusy(true);
    setError(null);
    let accepted = false;
    try {
      const raw = (await client.review({
        expectedVersion,
        resourceId: resource.id,
        active,
        expectedDigest: active ? preview!.result.image.digest : null,
        input,
        review: { evidenceRefs, note: note.trim() },
      })) as { id?: unknown; version?: unknown };
      if (
        raw?.id !== resource.id ||
        typeof raw.version !== "number" ||
        raw.version <= expectedVersion
      )
        throw new Error("Invalid review receipt");
      accepted = true;
      const current = logoItem(await client.loadLogo(resource.id), resource.id);
      if (generation.current !== ticket) return;
      if (
        !current ||
        current.version < raw.version ||
        current.active !== active
      )
        throw new Error("Accepted version is not current");
      setItem(current);
      setPreview(null);
      setFile(null);
      setFileInput((value) => value + 1);
      setEvidence("");
      setNote("");
      onReviewed();
    } catch (failure) {
      if (generation.current === ticket)
        setError(
          accepted
            ? "Review accepted, but the logo record is unavailable. Reload to confirm it."
            : message(
                failure,
                "The review could not be confirmed. Your preview and note are retained; retry or reload.",
              ),
        );
    } finally {
      // Always release the controls, even if a newer load superseded this one.
      setBusy(false);
    }
  }
  const current = item && logoUrl ? logoUrl(resource.id, item.digest) : null;
  return (
    <details className="cmd-observatory-review cmd-observatory-logo" open>
      <summary>Repository logo</summary>
      {item === undefined ? (
        loadFailed ? (
          <p role="alert">
            The logo record is unavailable. Reload it before reviewing.
          </p>
        ) : (
          <p role="status">Loading the reviewed logo record.</p>
        )
      ) : item === null ? (
        <p>No logo is approved. The badge shows the repository mark.</p>
      ) : (
        <figure className="cmd-observatory-logo__current">
          {current && (
            // eslint-disable-next-line @next/next/no-img-element -- digest-addressed same-origin PNG
            <img
              src={current}
              alt={`Approved logo for ${resource.name}`}
              width={64}
              height={64}
            />
          )}
          <figcaption>
            {item.active ? "Approved" : "Retired"}, version {item.version}.{" "}
            {sourceText(item.source)}. Recorded by {item.provenance.actorId} at{" "}
            {item.provenance.recordedAt}.
          </figcaption>
        </figure>
      )}
      <form onSubmit={runPreview}>
        <fieldset>
          <legend>Logo source</legend>
          <label className="cmd-observatory-review__check">
            <input
              type="radio"
              name={`logo-source-${resource.id}`}
              checked={mode === "upload"}
              onChange={() => setMode("upload")}
            />
            Upload a file
          </label>
          <label className="cmd-observatory-review__check">
            <input
              type="radio"
              name={`logo-source-${resource.id}`}
              checked={mode === "repository_file"}
              onChange={() => setMode("repository_file")}
            />
            File in the GitHub repository
          </label>
        </fieldset>
        {mode === "upload" ? (
          <label>
            Logo file (PNG, JPEG, WebP or SVG, up to 512 KiB)
            <input
              key={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setPreview(null);
              }}
            />
          </label>
        ) : (
          <>
            <label>
              Repository (owner/name)
              <input
                value={repository}
                placeholder="iurman/aviune"
                onChange={(event) => {
                  setRepository(event.target.value);
                  setPreview(null);
                }}
              />
            </label>
            <label>
              Path in the repository
              <input
                value={path}
                placeholder="public/favicon.svg"
                onChange={(event) => {
                  setPath(event.target.value);
                  setPreview(null);
                }}
              />
            </label>
            <label>
              Branch or tag (blank for the default branch)
              <input
                value={ref}
                onChange={(event) => {
                  setRef(event.target.value);
                  setPreview(null);
                }}
              />
            </label>
          </>
        )}
        <button type="submit" disabled={busy}>
          Preview logo
        </button>
      </form>
      {preview && (
        <figure className="cmd-observatory-logo__preview">
          {/* eslint-disable-next-line @next/next/no-img-element -- server-processed PNG preview */}
          <img
            src={`data:image/png;base64,${preview.result.image.dataBase64}`}
            alt={`Preview of the logo for ${resource.name}`}
            width={64}
            height={64}
          />
          <figcaption>
            This exact 128 px PNG will be stored.{" "}
            {sourceText(preview.result.source)}. Digest{" "}
            {preview.result.image.digest}.
          </figcaption>
        </figure>
      )}
      <label>
        Evidence references (one per line)
        <textarea
          value={evidence}
          onChange={(event) => setEvidence(event.target.value)}
        />
      </label>
      <label>
        Review note
        <input value={note} onChange={(event) => setNote(event.target.value)} />
      </label>
      <div className="cmd-observatory-logo__actions">
        <button
          type="button"
          disabled={busy || !preview || item === undefined}
          onClick={() => void submit(true)}
        >
          Approve this logo
        </button>
        {item?.active && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit(false)}
          >
            Retire logo
          </button>
        )}
        {(error || loadFailed) && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setItem(undefined);
              setLoadFailed(false);
              setError(null);
              setReload((value) => value + 1);
            }}
          >
            Reload logo record
          </button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
