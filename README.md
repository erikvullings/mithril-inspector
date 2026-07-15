# Mithril Inspector

Developer tooling for inspecting Mithril.js applications.

## Development

This repository is a pnpm workspace. Install dependencies and run the package-level checks from the repository root:

```sh
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

The packages under `packages/` are strict TypeScript, modern ESM modules. Playground applications live under `apps/`, while shared fixtures and integration suites live under `tests/`. Technical spikes are private workspace packages under `tests/fixtures/spikes/`; the decisions they validate are recorded in `docs/adr/`.
