# 0011 Server package: open-in-editor endpoint

Status: open
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
