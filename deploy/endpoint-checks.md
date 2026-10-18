# Native endpoint checks

**Status: Implemented locally. Production activation requires the reviewed release and catalogue.**

The leased Observatory worker supports read-only HTTP response-status and TCP
connection checks. It reuses source review, immutable encrypted observations,
source freshness, availability projection and the shared UI/API/MCP evidence.
It does not require InfraAgent or an unrestricted SSH runner.

## Operator catalogue

Set `OBSERVATORY_ENDPOINT_CHECKS_FILE` to the absolute path of a JSON file with
`schemaVersion: 1` and a `checks` array. Each entry has:

| Field                        | Meaning                                                                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                         | Unique alphanumeric/underscore/hyphen check identity, at most 200 characters.                                                                                                  |
| `resourceId`                 | Exact existing canonical host, service or deployment UUID.                                                                                                                     |
| `environment`                | Exact reviewed environment, or null.                                                                                                                                           |
| `vantage`                    | Human-readable location of the checking worker, at most 200 characters.                                                                                                        |
| `timeoutMs`                  | 100 to 30000 milliseconds; default 5000.                                                                                                                                       |
| `protocol`                   | `http` or `tcp`.                                                                                                                                                               |
| `url`, for HTTP              | Exact HTTP(S) URL, without credentials, query, fragment, whitespace or backslash.                                                                                              |
| `acceptedStatuses`, for HTTP | Nonempty unique list of accepted integer HTTP statuses, 200 through 599. Explicit acceptance of 401/403 observes an authentication boundary, not successful authenticated use. |
| `host`, `port`, for TCP      | Exact approved host and port, 1 through 65535.                                                                                                                                 |

The file is trusted operator configuration, not a browser upload or machine
request. Review targets against actual inventory before installation. Internal
Compose names and private addresses intentionally remain available to an
explicitly configured worker. Do not put tokens or credentials in the file.
Redirects are observed as statuses and never followed. Response bodies are
discarded. HTTPS retains normal certificate verification; use an approved TCP
check when only port reachability can be verified with available trust.

The file must be regular, non-symlink, at most 256 KiB, and unreadable by other
users, with no group write/execute permission. On the VPS, a root-owned 0640 file
with group 1000 permits the existing unprivileged container worker to read it.
Its parent directory remains operator-controlled. The production Compose
manifest mounts only that file, read-only, at the same absolute path. When the
variable is empty, `/dev/null` occupies an unused disabled target and the reader
is not constructed. Docker must not create a missing configured host file.

## Activation

1. Deploy the reviewed exact image and migration 0075 through the constrained
   release, backup/restore, owner-authentication and worker-smoke gates.
2. Install the reviewed catalogue outside Git and set the root-controlled
   production environment variable. Catalogue reload requires worker startup.
   Do not restart shared services or replace another campaign's release.
3. Confirm the target has its explicit active project/resource link. Stage a
   disabled owner source review with kind `endpoint-check`, the configured ID,
   exact resource/project/environment and actual evidence references.
4. Reread its version. Enable it through a second versioned owner source review.
   Unknown IDs or mismatched resource/environment fail closed before networking.
5. Verify a worker-delivered observation through the owner `operational` read,
   availability facet, and the scene. Preserve actual target, vantage, protocol,
   status, latency, timestamp and encrypted original. Verify a second scheduled
   observation before claiming recurring operation.

Source review is sensitive, owner-only and records `observatory.source.review`.
Checks perform fixed read-only network operations and record
`observatory.source.observed`. Existing machine grants do not expand. Separately
granted `observatory.read` and `observatory.signals.read` expose the same safe
availability payload through `get_observatory_operational_evidence`.
Configuration and credentials remain owner/operator-only.

## Rollback and limits

Disable the exact source with its expected version to stop future checks while
retaining history. Remove the optional catalogue variable/mount configuration
only through the controlled rollout. A source error preserves prior evidence
with unavailable current coverage. Code rollback does not reverse migrations.

A TCP success proves an accepted connection, not application health. An HTTP
success proves an accepted status from the named vantage, not response content,
an authenticated journey or an independent global uptime measurement. No check
is synthesized for services without a verified endpoint. Pings in the scene
are newly seen persisted checks; dependency lines never imply network traffic.

The first release's automatic rollback gates run before any new-kind source is
created. After native or account sources have been created, a pre-0075 application
cannot validate those new source-kind records even when disabled. Keep a compatible
0075-or-later image as the rollback target, or roll forward with a reviewed fix.
Do not delete observations or manufacture a down migration to make an older binary
accept them. The populated upgrade rehearsal verifies data preservation and repeated
migration, not old-binary reads of newly activated source kinds.
