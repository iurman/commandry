# Local human sign-in experiment

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

This local flow has no account recovery, external identity provider, production
origin validation, or human actor propagation into Commandry's product audit
records. These are explicit production gates, not claims of readiness.
