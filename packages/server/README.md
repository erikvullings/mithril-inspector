# @mithril-inspector/server

Open-in-editor middleware for Mithril Inspector. Framework-neutral:
`handleInspectorRequest` takes and returns plain
data, and `createInspectorMiddleware` adapts it to a Connect-compatible
handler (what Vite's dev server uses). No Vite dependency itself (ADR-004) —
`@mithril-inspector/vite` is the only current consumer.

## What it does

Serves one endpoint, `POST /__mithril-inspector/open-in-editor`, that takes a
`{ file, line, column }` body and launches the configured editor at that
location. Everything else passes through untouched.

Security (§10.2, §20.1.14, task 0011):

- **Path traversal prevention** — the requested file is resolved and checked
  against `root` (and any `projectRoots` for monorepos) before anything is
  launched; a path escaping every configured root is rejected.
- **Command-injection prevention** — the editor is launched via
  `execFile`-style argv arrays (never a shell string), so `file`/`line`/
  `column` can never be interpreted as shell syntax.
- **Bounded request bodies** — streamed and capped at `maxBodyBytes`
  (`DEFAULT_MAX_BODY_BYTES`, 16 KiB) before the handler ever sees them.

## Usage

```ts
import { createInspectorMiddleware } from "@mithril-inspector/server"

app.use(
  createInspectorMiddleware({
    root: projectRoot,
    editor: "code", // alias | { command, args } | undefined (env-var fallback, §10.3)
    projectRoots: [monorepoPackageRoot], // optional, §10.4
    pathMappings: [{ from: "/workspace", to: "/Users/me/project" }], // optional, remote/container dev
  }),
)
```

Supported editor aliases: `code`, `code-insiders`, `cursor`, `windsurf`,
`webstorm`, plus a custom `{ command, args: (location) => string[] }` shape
for anything else. With no `editor` option, `resolveEditor` checks
`MITHRIL_INSPECTOR_EDITOR`, `LAUNCH_EDITOR`, `VISUAL`, then `EDITOR` in that
order, and finally falls back to `"code"` (VS Code) so the endpoint works out
of the box — it never reports `EDITOR_NOT_AVAILABLE` on its own.

## Standalone server (§12.3)

Bundlers with no development-server hook of their own (e.g.
`@mithril-inspector/rollup`) can start a small standalone HTTP server serving
just this endpoint:

```ts
import { startInspectorServer } from "@mithril-inspector/server"

const handle = await startInspectorServer({ root: projectRoot, editor: "code" })
console.log(handle.url) // http://127.0.0.1:<port>
// later: await handle.close()
```

Binds to `127.0.0.1` by default (never a network-reachable host) and adds no
CORS headers, so a page must be same-origin to call it — pair it with a
reverse proxy, or mount `createInspectorMiddleware` directly in a dev server
you already run, if the app is served from a different origin/port.

## Lower-level pieces

`handleInspectorRequest` (bundler-neutral request/response, for adapters that
aren't Connect), `resolveEditor`, `applyPathMappings`, `resolveRequestedFile`,
`parseEditorRequestBody`, and `spawnEditorProcess` (injectable — tests pass a
stub launcher so no test run ever spawns a real editor process, see
`tests/browser/README.md`) are all exported individually for adapters that
need finer control than the middleware wrapper.
