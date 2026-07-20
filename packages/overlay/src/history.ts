import type { ComponentId, PreviewNode } from "@mithril-inspector/protocol"

import { isContainerNode, isEmptyPreviewValue, summarizeNode, type ContainerNode } from "./preview.js"

/**
 * The State History panel's model (task 0027): a per-selection rolling buffer
 * of a component's *already-captured* attrs and state previews (§7.4),
 * recorded each time it redraws, plus a diff between any two adjacent
 * snapshots. Attrs history (task 0027 follow-up) exists alongside state for
 * the same reason the Components tab shows both: a presentational,
 * attrs-only component (e.g. `UserCard` in the playground) has no state
 * worth tracking, and previously got nothing useful out of this tab at all.
 * This is deliberately read-only — there is no API here to push a snapshot
 * back into the live app (REQUIREMENTS.md §3.3 lists time-travel debugging
 * as an explicit non-goal). It exists to give visibility into how a
 * component's data changed over time, in the spirit of meiosis-tracer's
 * timeline, built entirely from data the runtime hook already exposes (no
 * `m.stream` interception, no new protocol surface).
 */

export interface HistoryEntry {
  readonly id: number
  readonly timestamp: number
  /** The state preview captured at this point, or `null` if the component had none / state capture is off. */
  readonly state: PreviewNode | null
  /** The attrs preview captured at this point, or `null` if the component had none / attrs capture is off (task 0027 follow-up). */
  readonly attrs: PreviewNode | null
}

export type HistoryDiffKind = "added" | "removed" | "changed"

/** Which of a component's two lazily-captured previews a diff row came from (task 0027 follow-up: attrs history). */
export type HistorySource = "attrs" | "state"

/**
 * How the History tab's combined attrs+state timeline is scoped — "both"
 * interleaves everything; the other two isolate just one source. Callers
 * pick "both" by default, but should fall back to whichever single source
 * actually has data once {@link hasMeaningfulHistoryData} says the other one
 * never carries anything (an attrs-only component's `state`, or a
 * state-only component's `attrs`) — there's no point offering a toggle
 * between "something" and "always empty".
 */
export type HistoryFilter = "both" | HistorySource

/** One changed field between two snapshots — `key` is `"(value)"` when the whole snapshot was replaced (a primitive changed, or the container's own kind changed). */
export interface HistoryDiffEntry {
  readonly key: string
  readonly source: HistorySource
  readonly kind: HistoryDiffKind
  readonly before: PreviewNode | null
  readonly after: PreviewNode | null
}

export interface HistoryStoreOptions {
  /** Rolling buffer size — oldest entries drop once exceeded (default 50). */
  readonly limit?: number
}

const DEFAULT_HISTORY_LIMIT = 50

export interface HistoryStore {
  /** Switch which component's history is being recorded; clears the buffer on an actual change, no-ops on a redundant re-set of the same id. */
  setWatchedComponent(id: ComponentId | null): void
  getWatchedComponent(): ComponentId | null
  /**
   * Append a snapshot if `id` is the currently-watched component; a no-op
   * otherwise. `state`/`attrs` are independent — either may be `null` (that
   * source's capture is gated off, or the component genuinely has none).
   */
  record(id: ComponentId, state: PreviewNode | null, attrs: PreviewNode | null, timestamp: number): void
  /** Every recorded snapshot for the watched component, oldest first. */
  entries(): readonly HistoryEntry[]
  selectEntry(id: number | null): void
  getSelectedEntryId(): number | null
  /** The explicitly-selected entry, the latest one if none was selected, or `null` when empty / the selected id is stale. */
  selectedEntry(): HistoryEntry | null
  /** The interleaved attrs+state diff between {@link selectedEntry} and its own immediate predecessor (§ own doc above) — never against the latest entry unless that happens to be the same one. See {@link diffHistoryEntries}. */
  selectedDiff(): readonly HistoryDiffEntry[]
}

export function createHistoryStore(options: HistoryStoreOptions = {}): HistoryStore {
  const limit = options.limit ?? DEFAULT_HISTORY_LIMIT
  let watchedId: ComponentId | null = null
  let entries: HistoryEntry[] = []
  let nextEntryId = 0
  let selectedId: number | null = null

  const store: HistoryStore = {
    setWatchedComponent(id) {
      if (id === watchedId) return
      watchedId = id
      entries = []
      selectedId = null
    },
    getWatchedComponent() {
      return watchedId
    },
    record(id, state, attrs, timestamp) {
      if (id !== watchedId) return
      // Auto-follow (task 0028): a selection that pointed at whatever was the
      // latest entry a moment ago — whether that's the `null` default or an
      // explicit click on the then-latest row — keeps following the new
      // latest entry. Only a selection of an entry that was *not* latest at
      // the time it was chosen stays pinned across future recordings.
      const previousLatestId = entries.length > 0 ? entries[entries.length - 1]!.id : null
      const wasFollowingLatest = selectedId === null || selectedId === previousLatestId
      entries.push({ id: nextEntryId, timestamp, state, attrs })
      nextEntryId += 1
      if (entries.length > limit) entries.splice(0, entries.length - limit)
      if (wasFollowingLatest) selectedId = null
    },
    entries() {
      return entries
    },
    selectEntry(id) {
      selectedId = id
    },
    getSelectedEntryId() {
      return selectedId
    },
    selectedEntry() {
      if (entries.length === 0) return null
      if (selectedId === null) return entries[entries.length - 1] ?? null
      return entries.find((entry) => entry.id === selectedId) ?? null
    },
    selectedDiff() {
      const current = store.selectedEntry()
      if (current === null) return []
      const index = entries.indexOf(current)
      const previous = index > 0 ? (entries[index - 1] ?? null) : null
      return diffHistoryEntries(previous, current)
    },
  }
  return store
}

/** Deep-equal check over two preview nodes (structural, not by reference) — the same shape a devtools value-equality check would use. */
function previewNodesEqual(a: PreviewNode, b: PreviewNode): boolean {
  if (a.kind !== b.kind) return false
  if (isContainerNode(a) && isContainerNode(b)) return diffContainerEntries(a, b, "state").length === 0
  return summarizeNode(a) === summarizeNode(b)
}

/** A container's entries/items keyed by a stable string: object props by key, arrays/typed-arrays by index (offset-adjusted), maps by their key's summary, sets by each item's own summary (order-insensitive; only loaded/paginated entries are compared). */
function keyedEntriesOf(node: ContainerNode): Map<string, PreviewNode> {
  switch (node.kind) {
    case "object":
      return new Map(node.entries.map((entry) => [entry.key, entry.node]))
    case "array":
    case "typed-array":
      return new Map(node.items.map((item, index) => [String(node.offset + index), item]))
    case "map":
      return new Map(node.entries.map((entry) => [summarizeNode(entry.key), entry.value]))
    case "set":
      return new Map(node.items.map((item) => [summarizeNode(item), item]))
  }
}

export interface ContainerEntry {
  readonly key: string
  readonly node: PreviewNode
}

/** A container's own entries/items as an ordered, key-labeled list (task 0028) — see {@link keyedEntriesOf}'s doc for the per-kind key scheme. */
export function containerEntries(node: ContainerNode): ContainerEntry[] {
  return Array.from(keyedEntriesOf(node), ([key, entryNode]) => ({ key, node: entryNode }))
}

export type AlignedDiffStatus = "added" | "removed" | "changed" | "unchanged"

export interface AlignedDiffRow {
  readonly key: string
  readonly before: PreviewNode | null
  readonly after: PreviewNode | null
  readonly status: AlignedDiffStatus
}

/**
 * Row-aligns two same-kind containers' own entries for a side-by-side
 * comparison (task 0028) — before's own key order first, then any keys only
 * `after` introduced, appended in `after`'s order. Used to render a
 * two-column before/after table for a `"changed"` object/array diff entry
 * instead of a shallow `summarizeNode` on each side.
 */
export function alignContainerEntries(before: ContainerNode, after: ContainerNode): AlignedDiffRow[] {
  const beforeEntries = keyedEntriesOf(before)
  const afterEntries = keyedEntriesOf(after)
  const keys: string[] = [...beforeEntries.keys()]
  for (const key of afterEntries.keys()) if (!beforeEntries.has(key)) keys.push(key)
  return keys.map((key) => {
    const b = beforeEntries.get(key) ?? null
    const a = afterEntries.get(key) ?? null
    const status: AlignedDiffStatus =
      b === null ? "added" : a === null ? "removed" : previewNodesEqual(b, a) ? "unchanged" : "changed"
    return { key, before: b, after: a, status }
  })
}

function diffContainerEntries(before: ContainerNode, after: ContainerNode, source: HistorySource): HistoryDiffEntry[] {
  const beforeEntries = keyedEntriesOf(before)
  const afterEntries = keyedEntriesOf(after)
  const out: HistoryDiffEntry[] = []
  for (const [key, beforeNode] of beforeEntries) {
    const afterNode = afterEntries.get(key)
    if (afterNode === undefined) {
      out.push({ key, source, kind: "removed", before: beforeNode, after: null })
    } else if (!previewNodesEqual(beforeNode, afterNode)) {
      out.push({ key, source, kind: "changed", before: beforeNode, after: afterNode })
    }
  }
  for (const [key, afterNode] of afterEntries) {
    if (!beforeEntries.has(key)) out.push({ key, source, kind: "added", before: null, after: afterNode })
  }
  return out
}

/**
 * Diffs two same-source preview snapshots (either can be `null` — no
 * snapshot yet / gated off). Container nodes of the same kind
 * (object/array/map/set/typed-array) are diffed entry-by-entry via
 * {@link keyedEntriesOf}; anything else (a primitive, a kind change, a
 * container replaced by a non-container) is reported as a single
 * whole-value entry keyed `"(value)"`.
 */
export function diffPreviewNodes(before: PreviewNode | null, after: PreviewNode | null, source: HistorySource): HistoryDiffEntry[] {
  if (before === null && after === null) return []
  if (before === null) return [{ key: "(value)", source, kind: "added", before: null, after }]
  if (after === null) return [{ key: "(value)", source, kind: "removed", before, after: null }]
  if (isContainerNode(before) && isContainerNode(after) && before.kind === after.kind) {
    return diffContainerEntries(before, after, source)
  }
  return previewNodesEqual(before, after) ? [] : [{ key: "(value)", source, kind: "changed", before, after }]
}

/**
 * Diffs both of two entries' captured sources (state, then attrs) and
 * interleaves the results into one combined list, sorted by key so an
 * attrs-driven change sits right next to a same-moment state-driven one
 * instead of two separate sections the caller has to cross-reference (task
 * 0027 follow-up: attrs history). `before` is `null` for the very first
 * recorded entry (no predecessor — every field reports as a whole-value
 * `"added"`).
 */
export function diffHistoryEntries(before: HistoryEntry | null, after: HistoryEntry): HistoryDiffEntry[] {
  const combined = [
    ...diffPreviewNodes(before?.state ?? null, after.state, "state"),
    ...diffPreviewNodes(before?.attrs ?? null, after.attrs, "attrs"),
  ]
  combined.sort((a, b) => a.key.localeCompare(b.key) || a.source.localeCompare(b.source))
  return combined
}

/**
 * Whether any recorded entry ever carried real data for `source` — used to
 * decide whether that whole swimlane is worth showing at all (task 0027
 * follow-up). An attrs-only presentational component's `state` is a
 * structurally-empty object on every redraw (Mithril still allocates one
 * even with no closure fields of its own), so showing it would only ever
 * produce a bare, contentless "(value): Object" diff row — worse than
 * leaving it out entirely.
 */
export function hasMeaningfulHistoryData(entries: readonly HistoryEntry[], source: HistorySource): boolean {
  return entries.some((entry) => !isEmptyPreviewValue(source === "state" ? entry.state : entry.attrs))
}
