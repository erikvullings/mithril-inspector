# 0016 MVP acceptance and 0.1.0-alpha.1 release

Status: open
Priority: high
Owner: unassigned
Agent: claude-sonnet
Area: release
Depends on: 0015

## Context
REQUIREMENTS.md §20.1 lists 15 MVP acceptance criteria; §21 Phase 1 ends with a publishable alpha (`0.1.0-alpha.1`). This task is the checkpoint: walk every criterion, close gaps, and prepare (not necessarily publish) the alpha.

## Acceptance Criteria
- All 15 items of §20.1 verified and checked off in this file's Agent Notes, each with evidence (test name or manual-verification note): install, config, tab, picker highlight, hover info, click suppression, open-in-editor at correct TS line, nested-element precision (own `m(...)` expression, not just component), fragment-root selection, basic ancestry view, HMR registry integrity, production exclusion, unchanged attrs/lifecycle, path-traversal + command-execution prevention, test coverage across transform/runtime/middleware/browser.
- Quality-gate items from §20.2 tracked: source maps verified against TS files; keyed-list redraw tests; fragment-root handling; lifecycle composition tests; editor-endpoint security tests. (The "two nontrivial Mithril applications" item gates the STABLE release, not the alpha — record status only.)
- Package versions set to `0.1.0-alpha.1`; changelog/README quick-start (§24 install + config snippet) written; `pnpm -r build && pnpm -r test` green.
- Repository left in a runnable state (§25.8); unsupported cases documented, not silently omitted (§25.9).

## Implementation Notes
- Note: §20.1.10 "basic component ancestry" — Phase 1 only needs the ancestry list from nearest-component lookup; the full tree is Phase 3. If ancestry requires 0017's instance tracking, either pull minimal ancestry forward or record the gap here and re-verify after 0019.
- Do not publish to npm without the user's go-ahead; "prepare" means tagged and pack-verified (`pnpm pack`).

## Agent Notes
- 2026-07-15: task created from REQUIREMENTS.md conversion; no work started.
