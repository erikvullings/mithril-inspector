# ADR-106: HMR mapping survival

Status: accepted (validated by spike, TASKS/0007)
Date: 2026-07-15
Related: REQUIREMENTS.md §6.1, §6.2, §6.3, §7.2, §8.8, §11.2 (`handleHotUpdate`), §16, §20.1.11; ADR-101, ADR-102, ADR-103, ADR-105; feeds task 0013 (Vite plugin) and 0010 (runtime)

## Context

When Vite HMR replaces a module, the source records the transform registered
for that module become stale: line/column numbers move, elements appear or
disappear, and the component export is a brand-new object. The inspector must
(§11.2 `handleHotUpdate`, §20.1.11) invalidate the module's stale metadata,
accept the replacement module's fresh source records, keep the current UI
selection alive when its identity is recoverable — otherwise degrade to a
documented "stale" state (§8.8, §16) — and **never** permanently corrupt the
registry: no unbounded growth across repeated edits, no crash. This spike
decides the **invalidation / re-registration protocol** between the plugin's
`handleHotUpdate` and the runtime source registry, and proves that after a
simulated edit the re-rendered element resolves to the *new* line numbers.

## Decision

Model the runtime side as a **source registry keyed by a stable-per-file module
id** (§7.2, `m:<string>`) whose source table is **replaced wholesale on
re-registration**. `createRuntimeRegistry()` in
`tests/fixtures/spikes/hmr-mapping-survival/` exposes the two-step protocol:

1. **`invalidateModule(moduleId)`** — called from `handleHotUpdate` *before* the
   replacement module executes. It drops the module's source table but keeps the
   entry as a tombstone (its generation and file), so a following
   re-registration bumps rather than resets the generation. Between the two
   steps `resolveSource` returns `null`, which the overlay renders as "Source
   file was replaced during HMR" (§16) rather than a stale location. It is also
   the *terminal* state when a module/file is deleted and never re-registers.
2. **`registerModule(moduleId, registration)`** — the transform's injected
   `registerModule("m:…", { file, relativeFile, sources })` call (§6.1), which
   runs when the replacement module is re-executed. It installs a fresh source
   `Map`, **discarding every previous source id for that module id**, and bumps
   the module's generation. Because the module id is stable per file path,
   re-registration *replaces* rather than *appends* — this is what bounds the
   registry across arbitrarily many edits and makes stale ids vanish.

Source ids are stamped on vnodes through a `WeakMap` (§6.2, ADR-101/103), never
as enumerable attrs, so `sourceOf(vnode)` (the hover path) resolves a stamped
vnode against the *current* registry. The stamped id (`m:<file>:s2`) is stable
across an edit; the registry is what changes, so after re-registration the same
vnode/id resolves to the new line. Resolution parses the qualified id by
splitting on the **last** colon (the module id itself contains `m:`), and any
malformed or unknown id degrades to `null`.

**Selection survival is computed lazily on read, not mutated on HMR.** `select`
captures a `SelectionRef`: the qualified id plus an identity *signature* — a
named component's `displayName`, or an unnamed element's `kind`+`tagName`. Line
numbers are deliberately **not** stored. `currentSelection()` re-resolves that
ref against the live registry each call, in three tiers:

- **Stable-id tier.** If the captured qualified id still resolves *and* its
  signature matches, the selection stays `live` (an edit that only shifted line
  numbers). This also keeps an indistinguishable sibling pinned to its own
  ordinal id rather than guessing.
- **Identity-recovery tier.** If the id shifted or vanished, search the module
  for the *single* source whose signature matches; a unique match re-locates the
  selection (`live`, `recovered: true`, ref re-pointed to the new id/line). This
  is how a selection survives an inserted element (id shift) or a moved
  component declaration (recovered by `displayName`).
- **Stale tier.** Zero matches, or an ambiguous multiple match, degrades to
  `{ status: "stale", reason }` — never a throw, never a guess.

Making selection a pure function of `(ref, live registry)` keeps it
order-independent: the sequence `invalidate → register` and any number of
subsequent edits all produce the correct state on the next read, with no
selection-mutation code paths to get out of order.

## Verified behaviors (spike, Mithril 2.3.8 + jsdom, Vitest)

`src/render.test.ts` drives the protocol against **real `m.render`**:

- After `invalidateModule` + `registerModule` (article moved line 5 → 8) and a
  remount, hovering the re-rendered element (`sourceOf(vnode)`) resolves to the
  **new** line 8, and the stamped vnode's `.dom` is the on-screen
  `article.user-card`.
- HMR replaces the module export with a new component object, so Mithril mounts a
  **new `vnode.state`** (component *instance* identity does not survive, ADR-103)
  — yet the selection, captured by `displayName`, is recovered to the new
  declaration line.
- Between `invalidateModule` and re-registration, `sourceOf` on a still-mounted
  vnode returns `null` without throwing, and the app keeps rendering.

`src/registry.test.ts` covers the registry contract: replace-not-append (dropped
ids resolve to `null`); no growth across 25 repeated edits (`sourceCount`
stays 2); the invalidate→re-register round-trip; several **interleaved** modules
staying independent across repeated, non-grouped re-registrations; and every
selection tier (line-shift survive, id-shift recover, `displayName` recover,
deleted → stale, module removed → stale, ambiguous siblings → stale).

## Findings for the Vite plugin (task 0013) and runtime (task 0010)

- `handleHotUpdate` should call `invalidateModule(moduleId)` for each updated
  module id up front, then let the re-executed module's own `registerModule`
  call restore the fresh table. The runtime needs no separate "replace" message.
- The module id must be **derived from the resolved file path**, stably, so the
  pre-update invalidate and the post-update register address the same entry
  (task 0013's `resolveId`/`transform` must agree with `handleHotUpdate`).
- The overlay's stale-selection UX (§8.8) is driven entirely by
  `currentSelection()`'s discriminated union; the plugin pushes no selection
  state across the HMR boundary.
- Identity signatures are only as good as the metadata the transform emits —
  `displayName` for components and `tagName` for elements (§6.3) are what make
  recovery work; without them recovery falls back to `kind` and is more often
  ambiguous.

## Rejected alternatives

- **Appending source records per registration (id-namespaced by generation).**
  Grows the registry without bound across edits (violates §20.1.11) and needs a
  separate reaper. Replace-on-re-register keyed by the stable module id is
  self-cleaning.
- **Storing the selected line/column and re-anchoring by proximity.** Line
  numbers are exactly what an edit invalidates; anchoring by identity signature
  (displayName / kind+tag) survives line shifts and most structural edits, and
  fails *closed* (stale) instead of silently selecting the wrong node.
- **Mutating the stored selection eagerly inside `invalidateModule` /
  `registerModule`.** Reintroduces ordering bugs across the two-step protocol
  (invalidate marks stale, a later register must un-mark). Re-resolving lazily on
  read is order-independent and has a single code path.
- **Keying the registry by vnode or component instance.** HMR discards both (new
  module object → remount → new `vnode.state`), so an instance-keyed registry
  loses everything on every edit. The file-stable module id is the only identity
  that spans the update.
- **Guessing among ambiguous identity matches.** Silently re-selecting one of
  two identical siblings is worse than a visible "stale" state the user can
  re-pick from; recovery refuses multiple matches.

## Limitations and follow-ups

- This spike simulates the **HMR round-trip** (the `invalidate` →
  `registerModule` → remount sequence a real `handleHotUpdate` plus re-executed
  module would produce) and renders the app half with **real `m.render`**. The
  live Vite dev-server round-trip — a real file edit firing `handleHotUpdate`
  end to end — is validated by the plugin task (0013) and the playground/browser
  tests (0014/0015), exactly as ADR-105 deferred real runtime wiring to 0010.
- Element identity uses `kind`+`tagName`; CSS classes/keys from §6.3 are not part
  of the signature yet. Adding `key` (when present) would disambiguate repeated
  siblings the current signature collapses (the ambiguous-list case) and is a
  cheap task-0010 improvement.
- The registry stores source metadata only; it does not yet own the
  component-instance registry (ADR-103/105). Task 0010 wires the two so a
  recovered *source* selection can re-point to the new *instance* after remount.
- Verified on Mithril 2.3.8 only; `vnode.state` remount-on-tag-change and the
  `.dom` placement the hover assertions rely on should be re-checked when the
  supported Mithril range changes.
