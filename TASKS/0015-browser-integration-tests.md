# 0015 Browser integration tests

Status: open
Priority: high
Owner: unassigned
Agent: claude-sonnet
Area: testing
Depends on: 0014

## Context
REQUIREMENTS.md §19.2: automated browser tests against fixture apps, using the available browser testing capability or the `browser-tools` skill (Chrome DevTools Protocol) — Playwright not required if existing tooling suffices. These tests gate every milestone (§25.6).

## Acceptance Criteria
Automated verification of the ten §19.2 assertions:
1. the inspector tab appears;
2. picker mode activates;
3. hover displays the correct component;
4. click selects the correct source;
5. the editor endpoint receives the expected file and line (mock the launcher, assert the request);
6. component ancestry is correct (extend once 0019 lands — mark pending until then);
7. redraws update mappings;
8. removed nodes are not selectable;
9. overlay interactions do not trigger application click handlers;
10. production build contains no inspector runtime.
- Tests run headless in CI via a single `pnpm test:browser` command and are stable (no flaky sleeps; wait on conditions).
- Fixtures cover keyed reordering, fragment roots, multiple mount roots, and HMR (§19.2 list) — reuse playground scenes or dedicated `tests/browser/` fixtures.

## Implementation Notes
- Compatibility targets (§19.3): Chromium now; Firefox once supported; Safari best-effort; Mithril 2.x current, Vite current two majors, Node active LTS. Encode the matrix in CI config even if only Chromium runs initially.
- Editor launches must be mocked at the server boundary — never spawn a real editor in CI.

## Agent Notes
- 2026-07-15: task created from REQUIREMENTS.md conversion; no work started.
