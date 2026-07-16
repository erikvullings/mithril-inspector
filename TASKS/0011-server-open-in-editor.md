# 0011 Server package: open-in-editor endpoint

Status: done
Priority: high
Owner: unassigned
Agent: claude-sonnet
Area: server
Depends on: 0008

## Context
REQUIREMENTS.md §4, §10, §12.2: `@mithril-inspector/server` handles editor launching, path validation, and shared dev-server middleware. Endpoint: `POST /__mithril-inspector/open-in-editor` with `{ file, line, column }` → `{ ok: true }` or `{ ok: false, error: { code, message } }`. This is the security-sensitive package.

## Acceptance Criteria
- Exposes both `createInspectorMiddleware(options): Connect.NextHandleFunction` and framework-neutral `handleInspectorRequest(request, options)` (§12.2) so non-Vite adapters reuse it.
- Security requirements (§10.2) all enforced and tested: dev-mode only, POST only, JSON only, body size limit, paths resolved against configured roots, path traversal rejected, symlink escape rejected, nonexistent files and directories rejected, line/column validated as positive bounded integers, no shell interpolation — `spawn` with argument arrays or a maintained editor-launch library, never `exec`.
- Editor selection (§10.3): aliases `code`, `code-insiders`, `cursor`, `windsurf`, `webstorm`, `idea`, `subl`, `vim`, `nvim`; custom `{ command, args({file,line,column}) }`; env fallbacks `MITHRIL_INSPECTOR_EDITOR`, `LAUNCH_EDITOR`, `VISUAL`, `EDITOR`.
- Path mappings for WSL/Docker/SSH/devcontainers/monorepos (§10.4), applied after root validation, before editor invocation.
- Server unit tests per §19.1: mocked launcher success, traversal, absolute paths outside root, symlinks, invalid line/column, wrong method, malformed JSON, oversized body, mappings, argument generation.
- Endpoint receives only file/line/column — never component data (§15).

## Implementation Notes
- Error codes (e.g. `FILE_OUTSIDE_ROOT`) come from protocol (0008).
- Evaluate `launch-editor` (used by Vue/Vite ecosystem) vs own safe `spawn`; either is acceptable per §10.2/§22 — record choice in Agent Notes.
- No Vite import; the Vite adapter (0013) wires this into `configureServer`.

## Agent Notes
- 2026-07-15: task created from REQUIREMENTS.md conversion; no work started.
- 2026-07-16 claude-sonnet: Implemented `@mithril-inspector/server` via TDD, one module per concern:
  - `path-mappings.ts` — `applyPathMappings` (§10.4), first-match-wins prefix rewrite.
  - `resolve-file.ts` — `resolveRequestedFile` (§10.2): traversal/outside-root rejection, nonexistent-file and directory rejection, symlink-escape rejection via `fs.realpath` on both the candidate *and* the configured roots (macOS resolves `os.tmpdir()` through a symlink — `/var` -> `/private/var` — so only realpath'ing the candidate produced false-positive `FILE_OUTSIDE_ROOT` rejections in tests; fixed by realpath'ing the roots too).
  - `request-body.ts` — `parseEditorRequestBody`: JSON parse/shape validation, `line`/`column` required to be positive bounded integers (`MAX_LINE_COLUMN = 10_000_000`), per-field error codes.
  - `editors.ts` — `resolveEditor`: all 9 aliases from §10.3 (code, code-insiders, cursor, windsurf, webstorm, idea, subl, vim, nvim) with real per-editor CLI argument conventions, custom `{command, args}` support, and the 4 env-var fallbacks in the documented priority order. Basename+extension matching (e.g. `code.cmd`) reused for env-derived commands; unrecognized commands drop the line/column and just open the file rather than risk a wrong position (§16).
  - `launch-editor-process.ts` — `spawnEditorProcess`: `child_process.spawn` with an argument array and `shell: false` (explicit, not just the default), resolves on the `spawn` event (does not wait for exit, since terminal editors block and GUI editors detach), rejects on `error` (e.g. ENOENT). Test proves shell metacharacters in an argument (`$(...)`, `;`, `&&`) arrive as a single literal argv element and are never executed.
  - `responses.ts` — status-code mapping and `{ok:false, error:{code,message}}` / `{ok:true}` body builders, wire-compatible with protocol's `EditorResponse`/`EditorErrorResponse`.
  - `handle-request.ts` — `handleInspectorRequest` orchestrates the full pipeline (method -> content-type -> body size -> JSON/shape -> file resolution -> path mapping -> editor resolution -> launch) and owns `InspectorServerOptions`/`InspectorRequest`/`OPEN_IN_EDITOR_PATH`/`DEFAULT_MAX_BODY_BYTES`.
  - `middleware.ts` — `createInspectorMiddleware` returns `connect.NextHandleFunction` (typed via `import type connect from "connect"`, `@types/connect` added as a dependency since it's part of the public `.d.ts` surface); streams the request body with a size cap that stops retaining bytes past the limit but keeps draining so the client gets a clean `413` instead of a connection reset, then delegates to `handleInspectorRequest`.
  - Editor-launch choice (Implementation Notes): evaluated `launch-editor` (the Vue/Vite-ecosystem package) by downloading and reading its source. Rejected it — on Windows it deliberately uses `child_process.exec` with `shell: true` plus manual `^`-escaping to work around `cmd.exe`, which is exactly what REQUIREMENTS §10.2 prohibits ("avoid `exec` and shell interpolation", no platform exception given). Implemented an own `spawn`-based launcher instead (argument arrays only, `shell: false` on every platform), reusing `launch-editor`'s per-editor CLI argument *conventions* (e.g. VS Code's `-g file:line:column`, JetBrains' `--line N --column M file`, vim's `+call cursor(line, col)`) as a design reference without taking the dependency.
  - `EditorErrorCode` (protocol, 0008) is reused as-is for every domain error (`FILE_OUTSIDE_ROOT`, `FILE_NOT_FOUND`, `INVALID_PATH`, `INVALID_LINE_COLUMN`, `IS_DIRECTORY`, `EDITOR_NOT_AVAILABLE`, `EDITOR_LAUNCH_FAILED`). Four additional transport-level codes not covered by protocol were added locally in `responses.ts` (`METHOD_NOT_ALLOWED` 405, `UNSUPPORTED_MEDIA_TYPE` 415, `INVALID_JSON` 400, `BODY_TOO_LARGE` 413) since these are HTTP-transport failures that never reach editor-open validation, not new "editor error" semantics; protocol itself was not modified.
  - "Dev-mode only" (§10.2) is satisfied structurally rather than by a runtime check: this package has no Vite import (verified via grep) and exposes only a request handler and a Connect middleware factory — it never listens on a port itself. The Vite adapter (0013) is expected to call `createInspectorMiddleware` solely from `configureServer`, a hook Vite only invokes for `vite dev`, never `vite build`, so no separate dev-mode gate is testable in isolation here.
  - README.md/CLAUDE.md not touched: neither file documents individual packages' APIs today (confirmed no prior protocol/transform/runtime task touched them either), so there was no existing per-package doc section to scope an update to.
  - Verified: 90 new tests across 8 files (`path-mappings.test.ts` 6, `resolve-file.test.ts` 11, `request-body.test.ts` 25, `editors.test.ts` 21, `launch-editor-process.test.ts` 3, `handle-request.test.ts` 17, `middleware.test.ts` 6, plus the pre-existing `index.test.ts` 1), via `pnpm --filter @mithril-inspector/server test`. `pnpm --filter @mithril-inspector/server typecheck` and a full `tsc -p tsconfig.json` build (declaration output) are both clean, zero errors/warnings. No known gaps against the acceptance criteria.
