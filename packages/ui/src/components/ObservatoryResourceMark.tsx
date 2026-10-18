"use client";

import { useState, type ReactNode } from "react";
import {
  OBSERVATORY_LOGO_SIZE,
  type ObservatoryRepresentationDto,
} from "@commandry/contracts";

/** The host's same-origin address for an approved logo image. */
export type ObservatoryLogoUrl = (resourceId: string, digest: string) => string;

/**
 * Label badge for one representation. An owner-approved logo replaces the
 * kind mark when the host supplies an image address; without one, or if the
 * image fails to load, the existing mark stays. The badge box has a fixed
 * size, so a late image never changes a measured label.
 */
export function ObservatoryResourceMark({
  node,
  fallback,
  logoUrl,
  tagKind = false,
}: {
  node: Pick<ObservatoryRepresentationDto, "kind" | "resourceId" | "logo">;
  fallback: ReactNode;
  logoUrl?: ObservatoryLogoUrl | undefined;
  /** Outline rows carry the kind on the badge itself; stage labels on the button. */
  tagKind?: boolean;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const digest = node.logo?.digest ?? null;
  const src =
    logoUrl && node.resourceId && digest && failed !== digest
      ? logoUrl(node.resourceId, digest)
      : null;
  return (
    <span
      className="cmd-op-kind"
      data-kind={tagKind ? node.kind : undefined}
      data-logo={src ? "true" : undefined}
      aria-hidden="true"
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
          onError={() => setFailed(digest)}
        />
      ) : (
        fallback
      )}
    </span>
  );
}
