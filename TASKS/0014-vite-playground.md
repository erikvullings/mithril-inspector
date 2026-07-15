# 0014 Vite playground application

Status: open
Priority: high
Owner: unassigned
Agent: claude-haiku
Area: playground
Depends on: 0013

## Context
REQUIREMENTS.md §4 (`apps/playground-vite`), §25: "The first concrete deliverable shall be a working Vite playground in which clicking an instrumented Mithril-rendered element opens the exact original TypeScript source line in VS Code." Also serves as the manual test bed for every later milestone (§25.7) and the base for browser-test fixtures (0015).

## Acceptance Criteria
- TypeScript Mithril 2.x app using only `plugins: [mithrilInspector()]` in `vite.config.ts` — no app-code changes (§2.2).
- Exercises the §19.2 fixture scenarios: simple mounted component, routing (`m.route`), nested components, list redraws, keyed reordering, fragment-root component, trusted HTML, SVG, in-app shadow DOM, multiple mount roots, component removal, scrolling content, CSS transforms, dialog/high z-index content.
- Manual walkthrough of §24 works end-to-end: `pnpm dev` → tab visible → picker → hover badge (component, tag, `src/...:line:col`) → click suppressed + selection shown → "Open in editor" lands on the exact original TS line in VS Code.
- `pnpm build` on the playground produces a bundle with zero inspector code (grep for `__MITHRIL_INSPECTOR__`/runtime markers).

## Implementation Notes
- Keep components small and named so display-name resolution (0018) is testable later.
- Include at least one closure, one object, and one class component (§6.5).
- HMR check: edit a component while dev server runs; mappings must survive (0007/0013).

## Agent Notes
- 2026-07-15: task created from REQUIREMENTS.md conversion; no work started.
