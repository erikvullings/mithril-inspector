# 0020 Phase 3: safe serializer and redaction

Status: open
Priority: medium
Owner: unassigned
Agent: claude-sonnet
Area: runtime
Depends on: 0010

## Context
REQUIREMENTS.md §7.4 and §15: attrs/state inspection needs a lazy, safe serializer — never unrestricted `JSON.stringify` — plus privacy redaction. Prerequisite for attrs/state views in the tree UI (0022).

## Acceptance Criteria
- Serializer handles, with unit tests for each (§7.4): circular references (labeled), functions, DOM nodes, symbols, bigints, Maps, Sets, typed arrays, Errors, Promises, throwing getters, Proxies, deep/very large objects.
- Lazy inspection: max initial depth, max entries per page, getters evaluated only on explicit user action, redaction hooks (§7.4).
- Redaction (§15): default key patterns (password, passwd, secret, token, authorization, cookie, apiKey, accessToken, refreshToken) case-insensitive; configurable `redact: { keys, replacement }`; per-component `setInspectorSerializer` (§14) applied before display.
- Privacy defaults enforced: values displayed locally only, never sent to the dev server, never persisted, never in DOM attributes, never console-logged (§15).
- Output is a serializable preview tree (protocol type) the overlay can render and expand incrementally.

## Implementation Notes
- Snapshots are read-only (§7.3); no attrs/state editing (§3.3 non-goal).
- Add the preview-tree types to `@mithril-inspector/protocol` (0008) as a minor addition.
- Getter evaluation must be wrapped in try/catch and marked as user-triggered in the protocol so the UI can show "(...)" affordances.

## Agent Notes
- 2026-07-15: task created from REQUIREMENTS.md conversion; no work started.
