# Local human sign-in and recovery experiment

**Status: Operational**

This opt-in experiment exercises the accepted Better Auth and PostgreSQL stack.
It does not select the production sign-in or recovery method in OQ-003. Public
environments remain disabled by runtime configuration.

Set `LOCAL_AUTH_MODE=password` and `INITIAL_ADMIN_EMAIL` in the ignored local
environment file before starting Compose. For phone review, also set
`LOCAL_AUTH_TRUSTED_ORIGIN` to the private HTTP origin with its explicit port,
such as `http://10.0.0.73:3011`. The default mode is `off` so the existing LAN
test/pass prompt remains a review gate only. The extra trusted origin is
validated as private IPv4 and cannot be used to permit an arbitrary public
domain.

After `pnpm compose:up`, create the one owner with a 12 to 128 character
password supplied on standard input to `pnpm auth:bootstrap:local`. The command
runs against the local Docker worker image and refuses an existing user. It
never prints the password. The web app disables public sign-up; the one-time
bootstrap command is the only local route that enables it. The owner email is
checked before user creation and again when a session is created.

For a fresh local database, enter a password without placing it in shell
history:

```sh
read -r -s local_auth_password
printf '%s' "$local_auth_password" | pnpm auth:bootstrap:local
unset local_auth_password
```

The human UI has `/sign-in` and `/account`. The Next.js proxy validates the
PostgreSQL session for human pages and `/api/v1` routes when the mode is on.
Unauthenticated API requests receive JSON 401; browser pages redirect to
`/sign-in`. The machine-authenticated POST routes for the local integration
receiver, runner callbacks, and MCP keep their independent scoped credentials.
The phone gateway forwards only the needed Better Auth session routes through
its existing subnet, host, Basic credential, same-origin, and body-size checks.
It still rejects public sign-up.

## Offline local owner recovery

After rebuilding the local Compose image with `pnpm compose:up`, the owner can
replace a lost password through `pnpm auth:recover:local`. The command requires
the configured owner email and a new 12 to 128 character password on separate
standard-input lines. The email must match the configured allowlist and the
database must contain exactly one user with one credential account. The command
never prints the password or hash. It stops the running local web service while
the password is replaced, revokes all of that owner's sessions, writes an
`auth.owner_password_recovered` audit event, and restarts the web service. A
failed reset also restarts a previously running web service. The operator should
check web readiness and sign in with the new password afterward.

For a local owner account, enter the new password without placing it in shell
history:

```sh
read -r local_owner_email
read -r -s local_new_password
printf '%s\n%s\n' "$local_owner_email" "$local_new_password" | pnpm auth:recover:local
unset local_owner_email local_new_password
```

This is a **sensitive, operator-only local action**. Its provisional required
capability is `local_operator.auth_recover`, enforced by access to the local
Docker socket and environment file rather than an in-product agent grant. The
explicit command and exact email confirmation are its approval behavior; no
in-product approval or external action is issued. Its audit event is
`auth.owner_password_recovered`, with the owner email, revoked-session count,
and event ID, never a credential value. An agent with only a Commandry product
session cannot invoke this command.

This recovery requires a working local operator terminal and Docker access. It
does not prove recovery after losing the VPS, a production origin, an external
identity provider, or human actor propagation into Commandry's product audit
records. The production sign-in and recovery decision remains open under
OQ-003; public environments remain blocked.
