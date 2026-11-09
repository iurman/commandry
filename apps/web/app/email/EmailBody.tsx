"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Button, createEmailDocument, emailContentId } from "@commandry/ui";
import type { MailAttachment, MailPage } from "@commandry/contracts";
import { mailApi } from "./api";
import styles from "./email.module.css";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function EmailBody({
  id,
  html,
  text,
  complete,
  attachments,
}: {
  id: string;
  html: string | null;
  text: string | null;
  complete: boolean;
  attachments: MailPage<MailAttachment>;
}) {
  const [mode, setMode] = useState<"formatted" | "text">("formatted"),
    [remoteImages, setRemoteImages] = useState(false),
    [inlineImages, setInlineImages] = useState<Record<string, string>>({}),
    [loading, setLoading] = useState(false),
    [imageStatus, setImageStatus] = useState("");
  const lifecycle = useRef({ generation: 0 }),
    imageLock = useRef(false);
  const domReady = useSyncExternalStore(
    subscribe,
    clientSnapshot,
    serverSnapshot,
  );
  const prepared = useMemo(
    () =>
      domReady && complete && html
        ? createEmailDocument(html, { remoteImages, inlineImages })
        : { document: "", contentIds: [] as string[] },
    [domReady, html, complete, remoteImages, inlineImages],
  );
  useEffect(() => {
    const state = lifecycle.current;
    return () => {
      state.generation++;
    };
  }, []);

  const remaining = prepared.contentIds.filter((cid) => !inlineImages[cid]);
  async function loadImages() {
    if (imageLock.current) return;
    imageLock.current = true;
    const current = lifecycle.current.generation;
    setRemoteImages(true);
    setLoading(true);
    setImageStatus("");
    let loaded = 0,
      failed = 0;
    // A user-selected batch resolves metadata only. Image bytes go directly to
    // the provider, with no-referrer and no shared-server byte copying.
    const requested = remaining.length ? remaining : prepared.contentIds;
    if (!remaining.length) setInlineImages({});
    const batch = requested
      .filter((cid) =>
        attachments.items.some(
          (a) => a.contentId && emailContentId(a.contentId) === cid,
        ),
      )
      .slice(0, 8);
    try {
      for (const cid of batch) {
        if (current !== lifecycle.current.generation) break;
        const attachment = attachments.items.find(
          (a) => a.contentId && emailContentId(a.contentId) === cid,
        )!;
        if (
          !/^image\/(png|jpeg|gif|webp|avif)$/i.test(attachment.contentType)
        ) {
          failed++;
          continue;
        }
        try {
          const page = await mailApi<MailPage<MailAttachment>>("attachments", {
            id,
            attachmentId: attachment.id,
          });
          const fresh = page.items.find((a) => a.id === attachment.id),
            url = new URL(fresh?.downloadUrl ?? "");
          if (url.protocol !== "https:" || url.username || url.password)
            throw new Error("Unavailable image");
          if (current === lifecycle.current.generation)
            setInlineImages((v) => ({ ...v, [cid]: url.href }));
          loaded++;
        } catch {
          failed++;
        }
      }
      if (current === lifecycle.current.generation)
        setImageStatus(
          `${loaded} embedded images resolved.${failed ? ` ${failed} unavailable; retry or use the original attachment.` : ""}` +
            (requested.length > batch.length
              ? " More embedded images remain. Load the next batch, or More attachments below to discover their references."
              : ""),
        );
    } finally {
      if (current === lifecycle.current.generation) setLoading(false);
      imageLock.current = false;
    }
  }
  return (
    <section className={styles.content} aria-label="Original message body">
      {html && (
        <div className={styles.actions}>
          <Button
            disabled={!complete}
            aria-pressed={mode === "formatted"}
            onClick={() => setMode("formatted")}
          >
            Formatted
          </Button>
          <Button
            aria-pressed={mode === "text"}
            onClick={() => setMode("text")}
          >
            Plain text
          </Button>
          {complete && (
            <Button disabled={loading} onClick={() => void loadImages()}>
              {loading
                ? "Loading images..."
                : remoteImages
                  ? remaining.length
                    ? "Load remaining images"
                    : "Refresh images"
                  : "Load images"}
            </Button>
          )}
        </div>
      )}
      {html && !complete && (
        <p className={styles.muted}>
          Load the remaining body to display the complete formatted message.
        </p>
      )}
      {html && complete && mode === "formatted" ? (
        <>
          <p className={styles.muted}>
            {remoteImages
              ? "Images are enabled for this message. Remote senders may observe image requests."
              : "Images from remote senders are blocked. Load images to display them and embedded attachments."}
          </p>
          {prepared.document && (
            <iframe
              className={styles.html}
              title="Isolated original email HTML"
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer"
              srcDoc={prepared.document}
            />
          )}
          {imageStatus && (
            <p role="status" className={styles.muted}>
              {imageStatus}
            </p>
          )}
        </>
      ) : (
        <pre className={styles.body}>
          {text ??
            "No plain-text body was supplied. Choose Formatted to view the original HTML."}
        </pre>
      )}
    </section>
  );
}
