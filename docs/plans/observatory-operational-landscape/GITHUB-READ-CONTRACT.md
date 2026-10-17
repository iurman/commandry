# Supported GitHub repository evidence

Status: Operational research, checked 2026-10-17. This is a read contract, not production activation.

## Supported upstream interface

GitHub REST lists repository pull requests with `GET /repos/{owner}/{repo}/pulls`, supports `state=open`, `per_page` up to 100 and page continuation. Public reads can be anonymous; a fine-grained token needs Pull requests read permission. [Official pull request REST documentation](https://docs.github.com/en/rest/pulls/pulls).

Code scanning offers paginated repository analyses and alerts. Analysis records include tool, ref, commit, creation time and error/warning information. A disabled or inaccessible endpoint is not a successful scan. [Official code scanning REST documentation](https://docs.github.com/en/rest/code-scanning/code-scanning?apiVersion=2026-03-10).

Dependabot repository alerts support separate read permission and list pagination. An empty returned alert list provides no proof that a completed scan occurred. [Official Dependabot REST documentation](https://docs.github.com/en/rest/dependabot/alerts).

Secret scanning list supports `hide_secret=true`. Always request it: the default can expose the literal secret. Fine-grained tokens need Secret scanning alerts read permission. [Official secret scanning REST documentation](https://docs.github.com/en/rest/secret-scanning/secret-scanning).

Use API version `2026-03-10`, Accept `application/vnd.github+json`. Endpoint paths above are bound to the explicitly reviewed repository identity, not URLs supplied by content.

## Commandry interpretation and transport requirements

These are product rules, not upstream guarantees. Complete each endpoint independently using validated Link continuation until absent. Never truncate a repository population to an arbitrary count. Reject repeated, external-origin or wrong-endpoint continuation. Authenticate only to the constructor-owned GitHub origin; redirects fail. Bound each streamed response to 2 MiB and each HTTP request to 10 seconds. Allow explicit loopback only for disposable tests. Errors contain safe codes, never provider bodies, headers or credentials.

PR state is development evidence. It never implies a deployment, runtime readiness or availability. Store number, title as literal untrusted text, draft, updated time, base/head ref, author, and a computed GitHub link. No invented review/check conclusions without a supported endpoint.

Keep code, dependency and secret scanning facets separate. Report available/inaccessible/unavailable/disabled-or-not-found/unsupported with read time, completeness, scanner/ref and actual analysis time when supplied. Zero observed open alerts does not mean uncompromised. Only an actual completed, error-free code analysis on the explicitly reported ref can establish completed scan evidence; unknown or stale scope stays explicit. Do not treat a 404 as certainly disabled. Preserve findings and incomplete coverage independently.

Derived DTOs use allowlisted fields only. Secret literal fields must be absent/null/empty when hide_secret is requested; fail that facet closed if an upstream response violates this, and never persist that unsafe response as original evidence. Never place tokens, raw response bodies, monitor configuration or secret literals in DTOs, errors or logs. Repository/provider text cannot authorize an action. Original accepted payloads remain server-private. A failed facet must retain its explicit failure state while successful independent facets remain usable.
