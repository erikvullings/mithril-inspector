# 0012 Overlay package: tab, picker, highlight, tooltip

Status: open
Priority: high
Owner: unassigned
Agent: claude-opus
Area: overlay
Depends on: 0008, 0010

## Context
REQUIREMENTS.md §4, §8: `@mithril-inspector/overlay` is the in-page UI, written in Mithril itself, mounted in `<div id="__mithril-inspector-host">` with an (open by default) shadow root. Phase 1 scope (§21): collapsed bottom tab, element picker, highlight rectangles, source tooltip/badge, selected-element details with "Open in editor". Consumes the runtime hook (0010) and posts to the editor endpoint (0011 — integration wired in 0013).

## Acceptance Criteria
- Collapsed tab fixed bottom-right by default (§8.1): configurable position, movable, position/collapsed state persisted in localStorage, light/dark following browser scheme, shadow-root isolated, no global styles, no pointer-event capture outside visible region.
- Host excluded from picking and from runtime tracking (§8.2).
- Picker (§8.4): toggle `Alt+Shift+M`, momentary hold `Alt+Shift`, Enter opens source, Escape cancels; all configurable; no plain Alt+Click default.
- Hover (§8.5): capture-phase pointer listener, `document.elementsFromPoint`, overlay ignored, best mapping resolved, highlight drawn without touching target styles, info badge shows component/element/`file:line`.
- Highlight (§8.6): separate fixed-position rectangles, follows scroll/resize/transforms via `getBoundingClientRect`, rAF-throttled, disappears when picker ends.
- Selection (§8.7): click prevented + propagation stopped by default, pass-through modifier available, highlight frozen, details panel shown, picker exits unless continuous mode.
- Stale nodes (§8.8): "Element no longer mounted", nearest-mounted-ancestor offer, no strong refs.
- UI distinguishes exact vs inferred mappings (§2.4) and degrades per the §2.4 fallback ladder.
- Accessibility (§18): keyboard navigable, semantic controls, focus indicators, WCAG AA contrast, no focus trap collapsed, reduced motion respected, shortcuts remappable/disable-able; picker mode visibly indicated.
- Vitest component tests for picker state machine, highlight geometry, and stale-node flow.

## Implementation Notes
- Panel tabs `[ Inspector ] [ Components ] [ Settings ]` (§8.3) — Components tab may be a placeholder until 0019/0022.
- Overlay errors must never break the host app (§16); surface them in a diagnostics view.
- Idle CPU near zero; one pointer update per animation frame (§17).
- Mithril + mithril-materialized conventions per user preferences where they don't conflict with the shadow-DOM/no-global-styles constraints (materialized CSS may need scoping inside the shadow root — evaluate, don't force).

## Agent Notes
- 2026-07-15: task created from REQUIREMENTS.md conversion; no work started.
