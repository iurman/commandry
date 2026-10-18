import { describe, expect, it } from "vitest";
import {
  OBSERVATORY_LOGO_MAX_INPUT_BYTES,
  observatoryLogoCatalogueItemSchema,
  observatoryLogoChangeSchema,
  observatoryLogoPathSchema,
  observatoryLogoPreviewSchema,
  observatoryLogoRepositorySchema,
} from "./observatory-logos";
import { observatoryRepresentationSchema } from "./observatory";

const resourceId = "abcdefab-0000-4000-8000-000000000001";
const digest = "a".repeat(64);
const commitSha = "b".repeat(40);
const review = { evidenceRefs: ["owner:inspector-preview"], note: "Logo" };
const upload = {
  kind: "upload",
  fileName: "resupals.svg",
  dataBase64: Buffer.from("<svg></svg>").toString("base64"),
};

describe("Observatory logo contracts", () => {
  it.each([
    "public/favicon.svg",
    ".github/logo.png",
    "assets/brand/logo@2x.png",
  ])("accepts the relative repository path %s", (path) => {
    expect(observatoryLogoPathSchema.parse(path)).toBe(path);
  });

  it.each([
    "/etc/passwd",
    "../logo.svg",
    "public/../../logo.svg",
    "public/./logo.svg",
    "https://example.com/logo.svg",
    "public//logo.svg",
    "public\\logo.svg",
    "logo.svg?raw=1",
    "",
  ])("refuses the repository path %j", (path) => {
    expect(observatoryLogoPathSchema.safeParse(path).success).toBe(false);
  });

  it("uses the reviewed owner/name repository syntax", () => {
    expect(observatoryLogoRepositorySchema.parse("iurman/lap-fitness")).toBe(
      "iurman/lap-fitness",
    );
    for (const value of [
      "iurman",
      "iurman/../commandry",
      "https://github.com/iurman/aviune",
      "iurman/aviune/tree/main",
    ])
      expect(observatoryLogoRepositorySchema.safeParse(value).success).toBe(
        false,
      );
  });

  it("previews by ref but reviews only an exact commit", () => {
    const repository = {
      kind: "repository_file",
      repository: "iurman/aviune",
      path: "public/favicon.svg",
    };
    expect(
      observatoryLogoPreviewSchema.parse({
        resourceId,
        input: { ...repository, ref: null },
      }).input,
    ).toMatchObject({ ref: null });
    expect(
      observatoryLogoChangeSchema.safeParse({
        expectedVersion: 0,
        resourceId,
        active: true,
        expectedDigest: digest,
        input: { ...repository, ref: "main" },
        review,
      }).success,
    ).toBe(false);
    expect(
      observatoryLogoChangeSchema.parse({
        expectedVersion: 0,
        resourceId,
        active: true,
        expectedDigest: digest,
        input: { ...repository, commitSha },
        review,
      }).input,
    ).toMatchObject({ commitSha });
  });

  it("requires a previewed input and digest to approve, and neither to retire", () => {
    const base = { expectedVersion: 1, resourceId, review };
    expect(
      observatoryLogoChangeSchema.safeParse({
        ...base,
        active: true,
        expectedDigest: null,
        input: upload,
      }).success,
    ).toBe(false);
    expect(
      observatoryLogoChangeSchema.safeParse({
        ...base,
        active: false,
        expectedDigest: digest,
        input: null,
      }).success,
    ).toBe(false);
    expect(
      observatoryLogoChangeSchema.parse({
        ...base,
        active: false,
        expectedDigest: null,
        input: null,
      }).active,
    ).toBe(false);
    expect(
      observatoryLogoChangeSchema.safeParse({
        ...base,
        active: false,
        expectedDigest: null,
        input: null,
        review: { evidenceRefs: [" "], note: "Retire" },
      }).success,
    ).toBe(false);
  });

  it("bounds uploads before decoding and refuses noncanonical base64 or path-like names", () => {
    const parse = (input: Record<string, unknown>) =>
      observatoryLogoPreviewSchema.safeParse({
        resourceId,
        input: { ...upload, ...input },
      }).success;
    expect(parse({})).toBe(true);
    expect(
      parse({
        dataBase64: "A".repeat(
          Math.ceil(OBSERVATORY_LOGO_MAX_INPUT_BYTES / 3) * 4 + 4,
        ),
      }),
    ).toBe(false);
    expect(parse({ dataBase64: "not base64!" })).toBe(false);
    expect(parse({ fileName: "../logo.svg" })).toBe(false);
    expect(parse({ fileName: "logo\u0000.svg" })).toBe(false);
    expect(parse({ mediaType: "image/png" })).toBe(false);
  });

  it("keeps catalogue rows bound to their resource and free of image bytes", () => {
    const item = {
      kind: "logo",
      id: resourceId,
      resourceId,
      version: 2,
      active: false,
      digest,
      mediaType: "image/png",
      width: 128,
      height: 128,
      source: {
        kind: "repository_file",
        repository: "iurman/lap-fitness",
        path: "public/logo.svg",
        commitSha,
        blobSha: "c".repeat(40),
        originalMediaType: "image/svg+xml",
        originalByteLength: 912,
        originalDigest: "d".repeat(64),
      },
      provenance: {
        actorId: "owner",
        recordedAt: "2026-10-18T02:00:00.000Z",
        evidenceRefs: ["owner:inspector-preview"],
      },
    };
    expect(observatoryLogoCatalogueItemSchema.parse(item)).toEqual(item);
    expect(
      observatoryLogoCatalogueItemSchema.safeParse({
        ...item,
        id: "abcdefab-0000-4000-8000-000000000002",
      }).success,
    ).toBe(false);
    expect(
      observatoryLogoCatalogueItemSchema.safeParse({
        ...item,
        dataBase64: "AAAA",
      }).success,
    ).toBe(false);
    expect(
      observatoryLogoCatalogueItemSchema.safeParse({
        ...item,
        mediaType: "image/svg+xml",
      }).success,
    ).toBe(false);
  });

  it("allows a logo only on a canonical resource representation", () => {
    const summary = {
      availability: {
        passing: 0,
        degraded: 0,
        failing: 0,
        unknown: 0,
        maintenance: 0,
        required: {
          passing: 0,
          degraded: 0,
          failing: 0,
          unknown: 0,
          maintenance: 0,
        },
        optional: {
          passing: 0,
          degraded: 0,
          failing: 0,
          unknown: 0,
          maintenance: 0,
        },
        unspecified: {
          passing: 0,
          degraded: 0,
          failing: 0,
          unknown: 0,
          maintenance: 0,
        },
        confirmedImpact: false,
      },
      coverage: {
        eligible: 0,
        monitored: 0,
        unmonitored: 0,
        stale: 0,
        state: "not_monitored",
      },
      telemetry: { counts: {}, signalIds: [] },
      capacity: { counts: {}, signalIds: [] },
      lifecycle: { counts: {}, signalIds: [] },
      security: { counts: {}, signalIds: [] },
      provider: { counts: {}, signalIds: [] },
      work: { counts: {}, signalIds: [] },
      incidentIds: [],
    };
    const node = {
      id: `resource:${resourceId}`,
      kind: "repository",
      resourceId,
      aggregateId: null,
      referenceTo: null,
      label: "ResuPals",
      layoutKey: `resource:${resourceId}`,
      parentRepresentationId: null,
      projects: [],
      memberCount: 1,
      memberDigest: "members",
      expansionRef: {
        groupId: `resource:${resourceId}`,
        scopeDigest: "scope",
        projectionRevision: "revision",
      },
      summary,
      logo: {
        digest,
        mediaType: "image/png",
        width: 128,
        height: 128,
        version: 1,
      },
    };
    expect(observatoryRepresentationSchema.parse(node).logo?.digest).toBe(
      digest,
    );
    expect(
      observatoryRepresentationSchema.safeParse({
        ...node,
        id: "group:repositories",
        kind: "collection",
        resourceId: null,
        aggregateId: "group:repositories",
      }).success,
    ).toBe(false);
    const { logo: _logo, ...withoutLogo } = node;
    expect(
      observatoryRepresentationSchema.parse(withoutLogo),
    ).not.toHaveProperty("logo");
  });
});
