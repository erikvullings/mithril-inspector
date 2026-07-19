import type { ComponentId, PreviewNode } from "@mithril-inspector/protocol"

import { isContainerNode, summarizeNode, type ContainerNode } from "./preview.js"

/**
 * The State History panel's model (task 0027): a per-selection rolling buffer
 * of a component's *already-captured* state preview (§7.4), recorded each
 * time it redraws, plus a diff between any two adjacent snapshots. This is
 * deliberately read-only — there is no API here to push a snapshot back into
 * the live app (REQUIREMENTS.md §3.3 lists time-travel debugging as an
 * explicit non-goal). It exists to give visibility into how a component's
 * state changed over time, in the spirit of meiosis-tracer's timeline, built
 * entirely from data the runtime hook already exposes (no `m.stream`
 * interception, no new protocol surface).
 */

export interface HistoryEntry {
  readonly id: number
  readonly timestamp: number
  /** The state preview captured at this point, or `null` if the component had none. */
  readonly state: PreviewNode | null
}

export type HistoryDiffKind = "added" | "removed" | "changed"

/** One changed field between two snapshots — `key` is `"(value)"` when the whole snapshot was replaced (a primitive changed, or the container's own kind changed). */
export interface HistoryDiffEntry {
  readonly key: string
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
  /** Append a snapshot if `id` is the currently-watched component; a no-op otherwise. */
  record(id: ComponentId, state: PreviewNode | null, timestamp: number): void
  /** Every recorded snapshot for the watched component, oldest first. */
  entries(): readonly HistoryEntry[]
  selectEntry(id: number | null): void
  getSelectedEntryId(): number | null
  /** The explicitly-selected entry, the latest one if none was selected, or `null` when empty / the selected id is stale. */
  selectedEntry(): HistoryEntry | null
  /** The diff between {@link selectedEntry} and its own immediate predecessor (§ own doc above) — never against the latest entry unless that happens to be the same one. */
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
    record(id, state, timestamp) {
      if (id !== watchedId) return
      entries.push({ id: nextEntryId, timestamp, state })
      nextEntryId += 1
      if (entries.length > limit) entries.splice(0, entries.length - limit)
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
      return diffPreviewNodes(previous?.state ?? null, current.state)
    },
  }
  return store
}

/** Deep-equal check over two preview nodes (structural, not by reference) — the same shape a devtools value-equality check would use. */
function previewNodesEqual(a: PreviewNode, b: PreviewNode): boolean {
  if (a.kind !== b.kind) return false
  if (isContainerNode(a) && isContainerNode(b)) return diffContainerEntries(a, b).length === 0
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

function diffContainerEntries(before: ContainerNode, after: ContainerNode): HistoryDiffEntry[] {
  const beforeEntries = keyedEntriesOf(before)
  const afterEntries = keyedEntriesOf(after)
  const out: HistoryDiffEntry[] = []
  for (const [key, beforeNode] of beforeEntries) {
    const afterNode = afterEntries.get(key)
    if (afterNode === undefined) {
      out.push({ key, kind: "removed", before: beforeNode, after: null })
    } else if (!previewNodesEqual(beforeNode, afterNode)) {
      out.push({ key, kind: "changed", before: beforeNode, after: afterNode })
    }
  }
  for (const [key, afterNode] of afterEntries) {
    if (!beforeEntries.has(key)) out.push({ key, kind: "added", before: null, after: afterNode })
  }
  return out
}

/**
 * Diffs two state-preview snapshots (either can be `null` — no snapshot yet /
 * gated off). Container nodes of the same kind (object/array/map/set/typed-array)
 * are diffed entry-by-entry via {@link keyedEntriesOf}; anything else (a
 * primitive, a kind change, a container replaced by a non-container) is
 * reported as a single whole-value entry keyed `"(value)"`.
 */
export function diffPreviewNodes(before: PreviewNode | null, after: PreviewNode | null): HistoryDiffEntry[] {
  if (before === null && after === null) return []
  if (before === null) return [{ key: "(value)", kind: "added", before: null, after }]
  if (after === null) return [{ key: "(value)", kind: "removed", before, after: null }]
  if (isContainerNode(before) && isContainerNode(after) && before.kind === after.kind) {
    return diffContainerEntries(before, after)
  }
  return previewNodesEqual(before, after) ? [] : [{ key: "(value)", kind: "changed", before, after }]
}
