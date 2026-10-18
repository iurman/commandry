"use client";

import { useState, type CSSProperties } from "react";
import { OBSERVATORY_LOGO_SIZE } from "@commandry/contracts";
import {
  legibleBrandColor,
  resourceIcon,
  type ResourceIcon,
} from "../gravity/resource-icons";

const serverPath = resourceIcon("server")!.path;

/** The host's same-origin address for an approved logo image. */
export type ObservatoryLogoUrl = (resourceId: string, digest: string) => string;

/**
 * Label badge for one representation: an owner-approved logo when the caller
 * supplies its address, else the resolved icon glyph. A logo that fails to
 * load falls back to the glyph. The badge box has a fixed size, so a late
 * image never changes a measured label. A host showing a technology (its
 * reported operating system, a name hint or an owner choice) keeps a small
 * server glyph in the corner, so it still reads as a machine.
 */
export function ObservatoryResourceMark({
  kind,
  subjectKind = kind,
  icon,
  theme,
  logo,
}: {
  kind: string;
  /** The pictured resource's kind; a shared reference names its target's. */
  subjectKind?: string | undefined;
  icon: ResourceIcon;
  theme: "porcelain" | "midnight";
  logo?: string | null | undefined;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const src = logo && failed !== logo ? logo : null;
  const color = src ? undefined : legibleBrandColor(icon, theme);
  const machine = !src && subjectKind === "host" && icon.id !== "server";
  return (
    <span
      className="cmd-op-kind"
      data-kind={kind}
      data-icon={icon.id}
      data-logo={src ? "true" : undefined}
      data-machine={machine ? "true" : undefined}
      aria-hidden="true"
      style={color ? ({ "--op-icon": color } as CSSProperties) : undefined}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- digest-addressed same-origin PNG; re-encoding it would change the approved bytes
        <img
          src={src}
          alt=""
          width={OBSERVATORY_LOGO_SIZE}
          height={OBSERVATORY_LOGO_SIZE}
          decoding="async"
          draggable={false}
          onError={() => setFailed(src)}
        />
      ) : (
        <svg viewBox="0 0 24 24" focusable="false">
          <path fillRule="evenodd" d={icon.path} />
        </svg>
      )}
      {machine && (
        <span className="cmd-op-kind-machine">
          <svg viewBox="0 0 24 24" focusable="false">
            <path fillRule="evenodd" d={serverPath} />
          </svg>
        </span>
      )}
    </span>
  );
}
