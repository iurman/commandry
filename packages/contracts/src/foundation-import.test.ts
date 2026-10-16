import assert from "node:assert/strict";
import { test } from "vitest";
import {
  FOUNDATION_IMPORT_MAX_BYTES,
  FOUNDATION_IMPORT_MAX_RECORDS,
  FOUNDATION_IMPORT_MAX_SOURCES,
  foundationImportOriginalPageSchema,
  foundationImportOriginalQuerySchema,
  foundationImportOriginalSourceSchema,
  foundationImportRevisionSchema,
  foundationSelectedImportInputSchema,
  foundationSelectedImportResultSchema,
  mnemosyneImportEnvelopeSchema,
  mnemosyneImportPlanSchema,
} from "./foundation-import.js";

const uuid = (index: number) =>
  `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
const projectId = uuid(1);
const digest = "a".repeat(64);
const timestamp = "2026-10-16T12:30:00.123456789+02:00";
const alias = { namespace: "mnemosyne", externalId: "selected-1" };
const expectedExistingMemory = {
  id: uuid(2),
  version: 2,
  contentDigest: digest,
  knowledgeItemId: uuid(3),
};
const evidence = {
  projectId,
  sourceKind: "external" as const,
  sourceId: "source-1",
  sourceVersion: "revision-1",
  contentDigest: digest,
  locator: "mnemosyne://source-1",
  observedAt: timestamp,
  availability: "available" as const,
};
function record(externalId = alias.externalId) {
  return {
    externalId,
    knowledgeItemId: uuid(3),
    statement: "  Preserve the exact statement.\r\n",
    category: "finding" as const,
    sourceTier: "public" as const,
    selected: true,
    sources: [{ evidence: { ...evidence }, originalContent: "original\r\n" }],
  };
}
function envelope() {
  return {
    schemaVersion: 1,
    projectId,
    namespace: alias.namespace,
    records: [record()],
  };
}
function review(externalId = alias.externalId) {
  return { externalId, selectionFingerprint: digest, expectedExistingMemory };
}
function input() {
  return {
    envelope: envelope(),
    decision: "apply_proposed_unverified",
    reviewedSelections: [review()],
  };
}
function recordPlan(externalId = alias.externalId) {
  return {
    alias: { ...alias, externalId },
    knowledgeItemId: uuid(3),
    category: "finding",
    sourceTier: "public",
    selected: true,
    statement: record().statement,
    selectionFingerprint: digest,
    sourceFingerprint: digest,
    reviewedSelection: true,
    sources: [{ ...evidence }],
    originalsAvailable: true,
    expectedExistingMemory,
    action: "new_proposal",
    reason: "reviewed_proposal_only",
  };
}
function plan() {
  return {
    schemaVersion: 1,
    projectId,
    namespace: alias.namespace,
    sideEffects: "none",
    existingCount: 0,
    records: [recordPlan()],
  };
}
function summary() {
  return {
    externalId: alias.externalId,
    sourceTier: "public",
    sourceFingerprint: digest,
    selectionFingerprint: digest,
    action: "revised",
    memoryId: uuid(2),
    version: 3,
    contentDigest: digest,
    importRevisionId: uuid(4),
    sourceCount: 1,
  };
}
function result() {
  return {
    record: {
      schemaVersion: 1,
      id: uuid(5),
      projectId,
      namespace: alias.namespace,
      appliedBy: "owner:isaac",
      recordedAt: timestamp,
      records: [summary()],
    },
    replayed: false,
    correlationId: uuid(5),
  };
}
function revision() {
  return {
    schemaVersion: 1,
    id: uuid(4),
    projectId,
    alias,
    memoryId: uuid(2),
    memoryVersion: 3,
    sourceFingerprint: digest,
    selectionFingerprint: digest,
    memoryContentDigest: digest,
    sourceTier: "public",
    sourceCount: 1,
    reviewedBy: "owner:isaac",
    reviewedAt: timestamp,
    recordedAt: timestamp,
    environment: "test",
    correlationId: uuid(5),
  };
}
function original() {
  return {
    revisionId: uuid(4),
    projectId,
    ordinal: 0,
    evidenceId: uuid(6),
    contentDigest: digest,
    originalContent: "original\r\n",
  };
}
const reject = (
  schema: { safeParse: (value: unknown) => { success: boolean } },
  value: unknown,
) => assert.equal(schema.safeParse(value).success, false);

test("exact DTOs reject unknown top-level and nested authority or source fields", () => {
  const families = [
    [mnemosyneImportEnvelopeSchema, envelope()],
    [mnemosyneImportPlanSchema, plan()],
    [foundationSelectedImportInputSchema, input()],
    [foundationSelectedImportResultSchema, result()],
    [foundationImportRevisionSchema, revision()],
    [foundationImportOriginalSourceSchema, original()],
    [
      foundationImportOriginalPageSchema,
      { items: [original()], nextOrdinal: null },
    ],
    [foundationImportOriginalQuerySchema, { projectId, revisionId: uuid(4) }],
  ] as const;
  for (const [schema, fixture] of families) {
    assert.equal(schema.safeParse(fixture).success, true);
    reject(schema, { ...fixture, ownerApproved: true });
  }
  const raw = envelope();
  reject(mnemosyneImportEnvelopeSchema, {
    ...raw,
    records: [{ ...record(), verified: true }],
  });
  reject(mnemosyneImportEnvelopeSchema, {
    ...raw,
    records: [
      { ...record(), sources: [{ ...record().sources[0], approved: true }] },
    ],
  });
  reject(mnemosyneImportEnvelopeSchema, {
    ...raw,
    records: [
      {
        ...record(),
        sources: [
          {
            originalContent: "x",
            evidence: { ...evidence, verification: "verified" },
          },
        ],
      },
    ],
  });
  reject(foundationSelectedImportInputSchema, {
    ...input(),
    reviewedSelections: [{ ...review(), approvedBy: "owner" }],
  });
  reject(foundationSelectedImportInputSchema, {
    ...input(),
    reviewedSelections: [
      {
        ...review(),
        expectedExistingMemory: { ...expectedExistingMemory, statement: "raw" },
      },
    ],
  });
});

test("preview permits empty and unselected populations; apply requires selected rows", () => {
  assert.deepEqual(
    mnemosyneImportEnvelopeSchema.parse({ ...envelope(), records: [] }).records,
    [],
  );
  assert.deepEqual(
    mnemosyneImportPlanSchema.parse({ ...plan(), records: [] }).records,
    [],
  );
  const unselected = {
    ...envelope(),
    records: [{ ...record(), selected: false }],
  };
  assert.equal(
    mnemosyneImportEnvelopeSchema.safeParse(unselected).success,
    true,
  );
  reject(foundationSelectedImportInputSchema, {
    ...input(),
    envelope: unselected,
    reviewedSelections: [],
  });
  reject(foundationSelectedImportInputSchema, {
    ...input(),
    envelope: { ...envelope(), records: [] },
    reviewedSelections: [],
  });
});

test("every tier requires exactly the selected review set, independent of order", () => {
  for (const sourceTier of ["public", "private", "client", "unknown"]) {
    const e = {
      ...envelope(),
      records: [
        { ...record("one"), sourceTier },
        { ...record("two"), sourceTier },
        { ...record("unselected"), sourceTier, selected: false },
      ],
    };
    const raw = {
      ...input(),
      envelope: e,
      reviewedSelections: [
        review("two"),
        { ...review("one"), expectedExistingMemory: null },
      ],
    };
    assert.equal(
      foundationSelectedImportInputSchema.safeParse(raw).success,
      true,
    );
    for (const reviewedSelections of [
      [],
      [review("one")],
      [review("one"), review("one")],
      [review("one"), review("unselected")],
      [review("one"), review("two"), review("unselected")],
    ])
      reject(foundationSelectedImportInputSchema, {
        ...raw,
        reviewedSelections,
      });
  }
  reject(foundationSelectedImportInputSchema, {
    ...input(),
    decision: "accept_verified",
  });
  reject(mnemosyneImportEnvelopeSchema, {
    ...envelope(),
    records: [{ ...record(), sourceTier: "trusted" }],
  });
});

test("review heads and fingerprints have strict shapes without authenticating review", () => {
  const raw = input();
  for (const selectionFingerprint of [
    "",
    "A".repeat(64),
    "a".repeat(63),
    "a".repeat(64) + "\n",
    "x".repeat(64),
  ]) {
    reject(foundationSelectedImportInputSchema, {
      ...raw,
      reviewedSelections: [{ ...review(), selectionFingerprint }],
    });
  }
  for (const expectedExistingMemory of [
    { ...review().expectedExistingMemory, version: 0 },
    {
      ...review().expectedExistingMemory,
      version: Number.MAX_SAFE_INTEGER + 1,
    },
    { ...review().expectedExistingMemory, knowledgeItemId: "invalid" },
    { id: uuid(2), version: 1, contentDigest: digest },
  ])
    reject(foundationSelectedImportInputSchema, {
      ...raw,
      reviewedSelections: [{ ...review(), expectedExistingMemory }],
    });
  assert.equal(
    foundationSelectedImportInputSchema.parse({
      ...raw,
      reviewedSelections: [
        { ...review(), selectionFingerprint: "b".repeat(64) },
      ],
    }).reviewedSelections[0]!.selectionFingerprint,
    "b".repeat(64),
  );
});

test("source text preserves Unicode, BOM, empty content, NUL, CRLF and replacement characters", () => {
  for (const originalContent of [
    "",
    "\ufeff leading\r\n\t\0 trailing ",
    "snowman \u2603 emoji \ud83d\ude80",
    "valid \ufffd",
  ]) {
    const raw = {
      ...envelope(),
      records: [{ ...record(), sources: [{ evidence, originalContent }] }],
    };
    assert.equal(
      mnemosyneImportEnvelopeSchema.parse(raw).records[0]!.sources[0]!
        .originalContent,
      originalContent,
    );
    assert.equal(
      foundationImportOriginalSourceSchema.parse({
        ...original(),
        originalContent,
      }).originalContent,
      originalContent,
    );
  }
  const parsed = mnemosyneImportEnvelopeSchema.parse(envelope());
  assert.equal(parsed.records[0]!.statement, record().statement);
  assert.equal(parsed.records[0]!.sources[0]!.evidence.observedAt, timestamp);
});

test("malformed Unicode is rejected wherever strings occur without replacing valid text", () => {
  for (const malformed of [
    "\ud800",
    "\udfff",
    "a\ud800b",
    "\ud800\ud800",
    "\udc00\ud800",
  ]) {
    reject(mnemosyneImportEnvelopeSchema, {
      ...envelope(),
      records: [{ ...record(), statement: malformed }],
    });
    reject(mnemosyneImportEnvelopeSchema, {
      ...envelope(),
      records: [
        { ...record(), sources: [{ evidence, originalContent: malformed }] },
      ],
    });
    reject(mnemosyneImportEnvelopeSchema, {
      ...envelope(),
      records: [
        {
          ...record(),
          sources: [
            {
              evidence: { ...evidence, locator: malformed },
              originalContent: "x",
            },
          ],
        },
      ],
    });
    reject(foundationImportOriginalSourceSchema, {
      ...original(),
      originalContent: malformed,
    });
    reject(foundationImportRevisionSchema, {
      ...revision(),
      reviewedBy: malformed,
    });
    reject(foundationSelectedImportInputSchema, {
      ...input(),
      reviewedSelections: [{ ...review(), externalId: malformed }],
    });
    reject(foundationSelectedImportResultSchema, {
      ...result(),
      record: { ...result().record, appliedBy: malformed },
    });
    reject(mnemosyneImportPlanSchema, {
      ...plan(),
      records: [{ ...recordPlan(), statement: malformed }],
    });
  }
});

test("unavailable originals and redacted statements remain explicitly nullable", () => {
  const unavailable = {
    evidence: { ...evidence, availability: "unavailable" },
    originalContent: null,
  };
  const raw = {
    ...envelope(),
    records: [{ ...record(), sources: [unavailable] }],
  };
  assert.equal(
    mnemosyneImportEnvelopeSchema.parse(raw).records[0]!.sources[0]!
      .originalContent,
    null,
  );
  for (const source of [
    { evidence, originalContent: null },
    { ...unavailable, originalContent: "" },
    { evidence },
  ])
    reject(mnemosyneImportEnvelopeSchema, {
      ...envelope(),
      records: [{ ...record(), sources: [source] }],
    });
  const redacted = {
    ...plan(),
    records: [
      {
        ...recordPlan(),
        statement: null,
        reviewedSelection: false,
        originalsAvailable: false,
        expectedExistingMemory: null,
        sources: [unavailable.evidence],
      },
    ],
  };
  assert.equal(
    mnemosyneImportPlanSchema.parse(redacted).records[0]!.statement,
    null,
  );
  reject(foundationImportOriginalSourceSchema, {
    ...original(),
    originalContent: null,
  });
});

test("1000 records and aggregate sources are inclusive across selected and unselected rows", () => {
  assert.equal(FOUNDATION_IMPORT_MAX_RECORDS, 1000);
  assert.equal(FOUNDATION_IMPORT_MAX_SOURCES, 1000);
  const records = Array.from({ length: 1000 }, (_, index) => ({
    ...record(String(index)),
    selected: false,
  }));
  assert.equal(
    mnemosyneImportEnvelopeSchema.parse({ ...envelope(), records }).records
      .length,
    1000,
  );
  reject(mnemosyneImportEnvelopeSchema, {
    ...envelope(),
    records: [...records, record("extra")],
  });
  const sources = Array.from({ length: 1000 }, () => record().sources[0]!);
  assert.equal(
    mnemosyneImportEnvelopeSchema.parse({
      ...envelope(),
      records: [{ ...record(), sources }],
    }).records[0]!.sources.length,
    1000,
  );
  reject(mnemosyneImportEnvelopeSchema, {
    ...envelope(),
    records: [{ ...record(), sources: [...sources, sources[0]!] }],
  });
  reject(mnemosyneImportEnvelopeSchema, {
    ...envelope(),
    records: [
      { ...record(), sources },
      { ...record("unselected"), selected: false },
    ],
  });
  reject(mnemosyneImportEnvelopeSchema, {
    ...envelope(),
    records: [{ ...record(), sources: [] }],
  });
});

test("duplicate external aliases and foreign source scopes are rejected", () => {
  reject(mnemosyneImportEnvelopeSchema, {
    ...envelope(),
    records: [record(), record()],
  });
  reject(mnemosyneImportPlanSchema, {
    ...plan(),
    records: [recordPlan(), recordPlan()],
  });
  reject(mnemosyneImportEnvelopeSchema, {
    ...envelope(),
    records: [
      {
        ...record(),
        sources: [
          {
            evidence: { ...evidence, projectId: uuid(99) },
            originalContent: "x",
          },
        ],
      },
    ],
  });
  reject(mnemosyneImportPlanSchema, {
    ...plan(),
    records: [{ ...recordPlan(), alias: { ...alias, namespace: "other" } }],
  });
  reject(mnemosyneImportPlanSchema, {
    ...plan(),
    records: [
      { ...recordPlan(), sources: [{ ...evidence, projectId: uuid(99) }] },
    ],
  });
});

test("plan includes all application action and reason variants without side effects", () => {
  const outcomes = [
    ["unselected", "not_selected"],
    ["disclosure_review_required", "exact_selection_review_missing"],
    ["unavailable_source", "original_unavailable"],
    ["new_proposal", "reviewed_proposal_only"],
    ["unchanged", "same_import_and_owner_baseline"],
    ["revision_requires_review", "import_changed"],
    ["revision_requires_review", "baseline_unavailable"],
    ["revision_requires_review", "knowledge_item_changed"],
    ["preserve_owner_changes", "owner_content_changed"],
  ];
  const records = outcomes.map(([action, reason], index) => ({
    ...recordPlan(String(index)),
    action,
    reason,
  }));
  assert.deepEqual(
    mnemosyneImportPlanSchema.parse({ ...plan(), records }).records,
    records,
  );
  for (const extra of [
    { sideEffects: "writes" },
    { existingCount: -1 },
    { existingCount: 1001 },
  ])
    reject(mnemosyneImportPlanSchema, { ...plan(), ...extra });
  reject(mnemosyneImportPlanSchema, {
    ...plan(),
    records: [{ ...recordPlan(), action: "accepted" }],
  });
  reject(mnemosyneImportPlanSchema, {
    ...plan(),
    records: [{ ...recordPlan(), reason: "trusted" }],
  });
});

test("plans bound the whole ordered source population without applying request byte limits", () => {
  const sources = Array.from({ length: 1000 }, (_, index) => ({
    ...evidence,
    sourceId: String(index),
  }));
  const raw = { ...plan(), records: [{ ...recordPlan(), sources }] };
  assert.deepEqual(
    mnemosyneImportPlanSchema.parse(raw).records[0]!.sources,
    sources,
  );
  reject(mnemosyneImportPlanSchema, {
    ...plan(),
    records: [{ ...recordPlan(), sources }, recordPlan("extra")],
  });
  const records = Array.from({ length: 1000 }, (_, index) => ({
    ...recordPlan(String(index)),
    statement: "x".repeat(20000),
  }));
  assert.ok(JSON.stringify(records).length > FOUNDATION_IMPORT_MAX_BYTES);
  assert.equal(
    mnemosyneImportPlanSchema.parse({ ...plan(), records }).records.length,
    1000,
  );
});

test("receipts contain only safe summaries and bind their correlation identity", () => {
  for (const action of ["created", "revised", "unchanged"]) {
    const raw = {
      ...result(),
      record: { ...result().record, records: [{ ...summary(), action }] },
    };
    assert.deepEqual(foundationSelectedImportResultSchema.parse(raw), raw);
  }
  for (const field of ["statement", "originalContent", "sources", "evidence"]) {
    reject(foundationSelectedImportResultSchema, {
      ...result(),
      record: { ...result().record, [field]: "raw" },
    });
    reject(foundationSelectedImportResultSchema, {
      ...result(),
      record: {
        ...result().record,
        records: [{ ...summary(), [field]: "raw" }],
      },
    });
    reject(foundationImportRevisionSchema, { ...revision(), [field]: "raw" });
  }
  reject(foundationSelectedImportResultSchema, {
    ...result(),
    correlationId: uuid(99),
  });
  reject(foundationSelectedImportResultSchema, {
    ...result(),
    record: {
      ...result().record,
      records: [{ ...summary(), action: "approved" }],
    },
  });
  reject(foundationSelectedImportResultSchema, {
    ...result(),
    record: { ...result().record, records: [] },
  });
});

test("revisions preserve owner metadata and timestamp precision with bounded source counts", () => {
  const raw = {
    ...revision(),
    reviewedAt: "2026-10-16T10:30:00.123456788Z",
    sourceCount: 1000,
  };
  assert.deepEqual(foundationImportRevisionSchema.parse(raw), raw);
  assert.equal(
    foundationSelectedImportResultSchema.parse(result()).record.recordedAt,
    timestamp,
  );
  for (const sourceCount of [0, 1001, 1.5, "1"]) {
    reject(foundationImportRevisionSchema, { ...revision(), sourceCount });
    reject(foundationSelectedImportResultSchema, {
      ...result(),
      record: { ...result().record, records: [{ ...summary(), sourceCount }] },
    });
  }
  for (const timestamp of [
    "2026-02-30T10:00:00Z",
    "2026-10-16T10:00:00",
    " 2026-10-16T10:00:00Z",
  ]) {
    reject(foundationImportRevisionSchema, {
      ...revision(),
      reviewedAt: timestamp,
    });
    reject(foundationImportRevisionSchema, {
      ...revision(),
      recordedAt: timestamp,
    });
  }
  reject(foundationImportRevisionSchema, {
    ...revision(),
    environment: "staging",
  });
  reject(foundationImportRevisionSchema, { ...revision(), memoryVersion: 0 });
});

test("original pagination defaults match the service and preserve all 1000 reachable ordinals", () => {
  assert.deepEqual(
    foundationImportOriginalQuerySchema.parse({
      projectId,
      revisionId: uuid(4),
    }),
    { projectId, revisionId: uuid(4), fromOrdinal: 0, limit: 100 },
  );
  const items = Array.from({ length: 1000 }, (_, ordinal) => ({
    ...original(),
    ordinal,
  }));
  assert.deepEqual(
    foundationImportOriginalPageSchema.parse({ items, nextOrdinal: null })
      .items,
    items,
  );
  assert.equal(
    foundationImportOriginalPageSchema.parse({
      items: [original()],
      nextOrdinal: 1000,
    }).nextOrdinal,
    1000,
  );
  assert.equal(
    foundationImportOriginalQuerySchema.parse({
      projectId,
      revisionId: uuid(4),
      fromOrdinal: 1000,
      limit: 1000,
    }).fromOrdinal,
    1000,
  );
  assert.deepEqual(
    foundationImportOriginalPageSchema.parse({ items: [], nextOrdinal: null }),
    { items: [], nextOrdinal: null },
  );
  reject(foundationImportOriginalPageSchema, {
    items: [...items, original()],
    nextOrdinal: null,
  });
  for (const nextOrdinal of [0, 1001, 1.5, "1"])
    reject(foundationImportOriginalPageSchema, { items: [], nextOrdinal });
  for (const ordinal of [-1, 1000, 0.5])
    reject(foundationImportOriginalSourceSchema, { ...original(), ordinal });
  for (const extra of [
    { fromOrdinal: -1 },
    { fromOrdinal: 1001 },
    { limit: 0 },
    { limit: 1001 },
    { limit: "100" },
  ])
    reject(foundationImportOriginalQuerySchema, {
      projectId,
      revisionId: uuid(4),
      ...extra,
    });
});

test("original output bytes can exceed the request budget without being rewritten", () => {
  const originalContent = "x".repeat(FOUNDATION_IMPORT_MAX_BYTES + 1);
  const raw = {
    items: [{ ...original(), originalContent }],
    nextOrdinal: null,
  };
  assert.equal(
    foundationImportOriginalPageSchema.parse(raw).items[0]!.originalContent,
    originalContent,
  );
});
