# 0013 Vite plugin

Status: open
Priority: high
Owner: unassigned
Agent: claude-opus
Area: vite
Depends on: 0007, 0009, 0010, 0011, 0012

## Context
REQUIREMENTS.md §4, §11: `@mithril-inspector/vite` combines transform, runtime injection, HTML injection and server middleware. Zero-config usage: `plugins: [mithrilInspector()]` — no app-code changes (§2.2). The adapter only integrates layers (§5); it must not duplicate transform or editor logic.

## Acceptance Criteria
- `mithrilInspector(options?: MithrilInspectorOptions): Plugin[]` implements the full options interface from §11.1 (enabled, includeInProduction, include/exclude, root(s), editor, pathMappings, ui.*, picker.*, componentTree.*, source.*, mithrilImports, hyperscriptIdentifiers, debug) plus `mode: "source" | "components" | "full"` (§17, §24).
- Dev-only by default: auto-disabled when `config.command === "build"` unless `includeInProduction` (§2.1); production bundles contain no runtime, overlay, or endpoint (§20.1.12) — verified by a build test.
- Hooks per §11.2: `configResolved` (root/filters/mode normalization), `resolveId`/`load` serving `virtual:mithril-inspector/runtime` and `.../overlay` with `\0`-prefixed resolved IDs, `transform` (instrument, preserve maps, skip node_modules/self/generated files, content+options cache), `transformIndexHtml` (inject overlay bootstrap — no entry-file edits), `configureServer` (editor endpoint + optional diagnostics), `handleHotUpdate` (invalidate metadata, push replacement records, preserve selection, drop stale registrations — per 0007 ADR).
- `enforce: "pre"` where transforms must see original TS/JSX; plugin split into pre/post parts if JSX cooperation requires it; intended order documented (§11.3).
- Optional `source.exposeDomAttributes` mode adds compact `data-mi="m17:s2"` attributes, no absolute paths, off by default (§13).
- Unit tests for option normalization, virtual module serving, build-mode exclusion, and transform filtering.

## Implementation Notes
- Returning a plugin array is explicitly allowed (§11.1).
- Privacy defaults (§15): component data never sent to the dev server; endpoint gets only file/line/column; default redaction key patterns wired through to runtime config.
- Debug logging gated behind `debug: true`, log-once semantics (§16).

## Agent Notes
- 2026-07-15: task created from REQUIREMENTS.md conversion; no work started.
