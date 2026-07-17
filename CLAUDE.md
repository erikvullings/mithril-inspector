# Repository guidance

- Use pnpm workspace commands from the repository root.
- Keep every package strict TypeScript and modern ESM.
- Keep `protocol`, `transform`, `runtime`, `overlay`, and `server` independent of Vite.
- Put package tests beside their source and run them independently with Vitest.
- Technical spikes are private workspace packages under `tests/fixtures/spikes/`; record each spike's outcome as an ADR in `docs/adr/`.
- `tests/browser` is the Puppeteer-driven headless-Chromium integration suite (`pnpm test:browser`); it needs `pnpm build` first and never spawns a real editor (see `tests/browser/README.md`).
