# Local experience lab

This private Storybook application renders the exported UI and experience
packages using synthetic examples. It is development tooling, not a product
route or a deployable site.

From the repository root, run `pnpm lab`. Storybook binds to
`http://127.0.0.1:6006` with an exact port. `pnpm lab:check` checks types and
the production boundary, and `pnpm lab:test` runs the local component tests.

The State panel stories cover normal, loading, empty, error, disabled, and
permission-denied states. The feedback preference story simulates channel
availability without playing sound or triggering haptics.
