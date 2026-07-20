import type { PreviewArrayNode, PreviewObjectNode, ComponentId, PreviewNode, PreviewPath } from "@mithril-inspector/protocol"
import { describe, expect, it } from "vitest"

import {
  alignContainerEntries,
  containerEntries,
  createHistoryStore,
  diffHistoryEntries,
  diffPreviewNodes,
  hasMeaningfulHistoryData,
  type HistoryEntry,
} from "./history.js"

const EMPTY_PATH: PreviewPath = []

const num = (value: number): PreviewNode => ({ kind: "primitive", type: "number", value })
const str = (value: string): PreviewNode => ({ kind: "primitive", type: "string", value })
const bool = (value: boolean): PreviewNode => ({ kind: "primitive", type: "boolean", value })

const obj = (entries: Record<string, PreviewNode>): PreviewObjectNode => ({
  kind: "object",
  className: "Object",
  size: Object.keys(entries).length,
  entries: Object.entries(entries).map(([key, node]) => ({ key, node })),
  offset: 0,
  truncated: false,
  path: EMPTY_PATH,
})

const arr = (items: PreviewNode[]): PreviewArrayNode => ({
  kind: "array",
  length: items.length,
  items,
  offset: 0,
  truncated: false,
  path: EMPTY_PATH,
})

const c1 = "c:1" as ComponentId
const c2 = "c:2" as ComponentId

const entry = (id: number, state: PreviewNode | null, attrs: PreviewNode | null = null, timestamp = id * 10): HistoryEntry => ({
  id,
  timestamp,
  state,
  attrs,
})

describe("diffPreviewNodes (task 0027)", () => {
  it("returns no entries for two nulls", () => {
    expect(diffPreviewNodes(null, null, "state")).toEqual([])
  })

  it("reports a whole-value addition when there was no previous snapshot", () => {
    const after = obj({ count: num(0) })
    expect(diffPreviewNodes(null, after, "state")).toEqual([{ key: "(value)", source: "state", kind: "added", before: null, after }])
  })

  it("reports a whole-value removal when there is no current snapshot", () => {
    const before = obj({ count: num(0) })
    expect(diffPreviewNodes(before, null, "state")).toEqual([
      { key: "(value)", source: "state", kind: "removed", before, after: null },
    ])
  })

  it("reports no changes for two structurally-equal object previews (different references)", () => {
    const before = obj({ count: num(1), label: str("a") })
    const after = obj({ count: num(1), label: str("a") })
    expect(diffPreviewNodes(before, after, "state")).toEqual([])
  })

  it("reports added, removed and changed object keys together in one diff", () => {
    const before = obj({ kept: num(1), changed: num(1), removed: bool(true) })
    const after = obj({ kept: num(1), changed: num(2), added: str("new") })

    const diff = diffPreviewNodes(before, after, "state")
    expect(diff).toHaveLength(3)
    expect(diff).toContainEqual({ key: "changed", source: "state", kind: "changed", before: num(1), after: num(2) })
    expect(diff).toContainEqual({ key: "removed", source: "state", kind: "removed", before: bool(true), after: null })
    expect(diff).toContainEqual({ key: "added", source: "state", kind: "added", before: null, after: str("new") })
  })

  it("diffs array items by index", () => {
    const before = arr([num(1), num(2)])
    const after = arr([num(1), num(3), num(4)])

    const diff = diffPreviewNodes(before, after, "state")
    expect(diff).toContainEqual({ key: "1", source: "state", kind: "changed", before: num(2), after: num(3) })
    expect(diff).toContainEqual({ key: "2", source: "state", kind: "added", before: null, after: num(4) })
    expect(diff).toHaveLength(2)
  })

  it("recurses into nested containers rather than treating them as opaque", () => {
    const before = obj({ nested: obj({ x: num(1) }) })
    const after = obj({ nested: obj({ x: num(2) }) })
    expect(diffPreviewNodes(before, after, "state")).toEqual([
      { key: "nested", source: "state", kind: "changed", before: obj({ x: num(1) }), after: obj({ x: num(2) }) },
    ])
  })

  it("treats a value whose kind changed as a single whole-value change, not a crash", () => {
    const before = num(1)
    const after = obj({ x: num(1) })
    expect(diffPreviewNodes(before, after, "state")).toEqual([{ key: "(value)", source: "state", kind: "changed", before, after }])
  })

  it("tags every entry with the requested source", () => {
    const before = obj({ name: str("a") })
    const after = obj({ name: str("b") })
    expect(diffPreviewNodes(before, after, "attrs")).toEqual([
      { key: "name", source: "attrs", kind: "changed", before: str("a"), after: str("b") },
    ])
  })
})

describe("diffHistoryEntries (task 0027 follow-up: attrs history)", () => {
  it("interleaves state and attrs diffs, sorted by key", () => {
    const before = entry(1, obj({ zeta: num(1) }), obj({ alpha: str("a") }))
    const after = entry(2, obj({ zeta: num(2) }), obj({ alpha: str("b") }))
    expect(diffHistoryEntries(before, after)).toEqual([
      { key: "alpha", source: "attrs", kind: "changed", before: str("a"), after: str("b") },
      { key: "zeta", source: "state", kind: "changed", before: num(1), after: num(2) },
    ])
  })

  it("only reports whole-value additions for sources that actually had data on the first entry", () => {
    const first = entry(1, obj({ count: num(1) }), null)
    expect(diffHistoryEntries(null, first)).toEqual([
      { key: "(value)", source: "state", kind: "added", before: null, after: obj({ count: num(1) }) },
    ])
  })

  it("produces nothing when neither source changed", () => {
    const before = entry(1, obj({ count: num(1) }), obj({ name: str("a") }))
    const after = entry(2, obj({ count: num(1) }), obj({ name: str("a") }))
    expect(diffHistoryEntries(before, after)).toEqual([])
  })
})

describe("hasMeaningfulHistoryData (task 0027 follow-up: attrs history)", () => {
  it("is false when a source is null on every entry", () => {
    const entries = [entry(1, obj({ count: num(1) }), null), entry(2, obj({ count: num(2) }), null)]
    expect(hasMeaningfulHistoryData(entries, "state")).toBe(true)
    expect(hasMeaningfulHistoryData(entries, "attrs")).toBe(false)
  })

  it("is false when a source is a structurally-empty container on every entry (e.g. an attrs-only component's state)", () => {
    const entries = [entry(1, obj({}), obj({ name: str("a") })), entry(2, obj({}), obj({ name: str("b") }))]
    expect(hasMeaningfulHistoryData(entries, "state")).toBe(false)
    expect(hasMeaningfulHistoryData(entries, "attrs")).toBe(true)
  })

  it("is true as soon as any single entry has real data", () => {
    const entries = [entry(1, obj({}), null), entry(2, obj({ count: num(1) }), null)]
    expect(hasMeaningfulHistoryData(entries, "state")).toBe(true)
  })

  it("is false for an empty entries list", () => {
    expect(hasMeaningfulHistoryData([], "state")).toBe(false)
  })
})

describe("createHistoryStore (task 0027)", () => {
  it("starts empty with nothing watched", () => {
    const store = createHistoryStore()
    expect(store.getWatchedComponent()).toBeNull()
    expect(store.entries()).toEqual([])
    expect(store.selectedEntry()).toBeNull()
    expect(store.selectedDiff()).toEqual([])
  })

  it("ignores a recorded snapshot for a component that isn't being watched", () => {
    const store = createHistoryStore()
    store.setWatchedComponent(c1)
    store.record(c2, obj({ count: num(1) }), null, 100)
    expect(store.entries()).toEqual([])
  })

  it("accumulates snapshots in order for the watched component", () => {
    const store = createHistoryStore()
    store.setWatchedComponent(c1)
    store.record(c1, obj({ count: num(1) }), null, 100)
    store.record(c1, obj({ count: num(2) }), null, 200)

    const entries = store.entries()
    expect(entries.map((e) => e.timestamp)).toEqual([100, 200])
    expect(entries[0]?.id).not.toBe(entries[1]?.id)
  })

  it("records attrs alongside state independently", () => {
    const store = createHistoryStore()
    store.setWatchedComponent(c1)
    store.record(c1, null, obj({ name: str("Ada") }), 100)

    const [only] = store.entries()
    expect(only?.state).toBeNull()
    expect(only?.attrs).toEqual(obj({ name: str("Ada") }))
  })

  it("clears the buffer when the watched component changes, but not on a redundant re-set of the same id", () => {
    const store = createHistoryStore()
    store.setWatchedComponent(c1)
    store.record(c1, obj({ count: num(1) }), null, 100)

    store.setWatchedComponent(c1) // same id again — no reset
    expect(store.entries()).toHaveLength(1)

    store.setWatchedComponent(c2) // different id — resets
    expect(store.entries()).toEqual([])
    expect(store.selectedEntry()).toBeNull()
  })

  it("clears the buffer when watching stops (null)", () => {
    const store = createHistoryStore()
    store.setWatchedComponent(c1)
    store.record(c1, obj({ count: num(1) }), null, 100)
    store.setWatchedComponent(null)
    expect(store.entries()).toEqual([])
    expect(store.getWatchedComponent()).toBeNull()
  })

  it("caps the rolling buffer at the configured limit, dropping the oldest entries first", () => {
    const store = createHistoryStore({ limit: 3 })
    store.setWatchedComponent(c1)
    for (let i = 1; i <= 5; i += 1) store.record(c1, num(i), null, i * 10)

    const entries = store.entries()
    expect(entries).toHaveLength(3)
    expect(entries.map((e) => e.timestamp)).toEqual([30, 40, 50])
  })

  it("defaults selectedEntry to the latest snapshot when nothing was explicitly selected", () => {
    const store = createHistoryStore()
    store.setWatchedComponent(c1)
    store.record(c1, num(1), null, 100)
    store.record(c1, num(2), null, 200)
    expect(store.selectedEntry()?.timestamp).toBe(200)
  })

  it("returns null from selectedEntry when an unknown entry id is selected", () => {
    const store = createHistoryStore()
    store.setWatchedComponent(c1)
    store.record(c1, num(1), null, 100)
    store.selectEntry(999_999)
    expect(store.selectedEntry()).toBeNull()
  })

  it("diffs the selected entry against its own immediate predecessor, not against the latest entry (interleaved snapshots)", () => {
    const store = createHistoryStore()
    store.setWatchedComponent(c1)
    // Three snapshots, deliberately with a non-monotonic value shape so a diff
    // that accidentally compared against the wrong neighbor would be caught.
    store.record(c1, obj({ count: num(1) }), null, 100) // A
    store.record(c1, obj({ count: num(2) }), null, 200) // B
    store.record(c1, obj({ count: num(5) }), null, 300) // C
    const [a, b, c] = store.entries()

    // Selecting the middle entry (B) must diff against A, not against C or "latest".
    store.selectEntry(b!.id)
    expect(store.selectedDiff()).toEqual([{ key: "count", source: "state", kind: "changed", before: num(1), after: num(2) }])

    // Selecting the first entry (A) has no predecessor: whole-value "added".
    store.selectEntry(a!.id)
    expect(store.selectedDiff()).toEqual([
      { key: "(value)", source: "state", kind: "added", before: null, after: obj({ count: num(1) }) },
    ])

    // Selecting the last entry (C) diffs against B.
    store.selectEntry(c!.id)
    expect(store.selectedDiff()).toEqual([{ key: "count", source: "state", kind: "changed", before: num(2), after: num(5) }])
  })

  it("interleaves attrs and state changes in selectedDiff()", () => {
    const store = createHistoryStore()
    store.setWatchedComponent(c1)
    store.record(c1, obj({ count: num(1) }), obj({ name: str("Ada") }), 100)
    store.record(c1, obj({ count: num(2) }), obj({ name: str("Grace") }), 200)

    expect(store.selectedDiff()).toEqual([
      { key: "count", source: "state", kind: "changed", before: num(1), after: num(2) },
      { key: "name", source: "attrs", kind: "changed", before: str("Ada"), after: str("Grace") },
    ])
  })

  it("keeps following new snapshots after explicitly selecting the entry that was, at the time, the latest one (task 0028)", () => {
    const store = createHistoryStore()
    store.setWatchedComponent(c1)
    store.record(c1, num(1), null, 100)
    store.record(c1, num(2), null, 200)
    const entries = store.entries()
    const latest = entries[entries.length - 1]!
    store.selectEntry(latest.id) // explicitly click the entry that happens to be latest right now
    expect(store.selectedEntry()?.timestamp).toBe(200)

    store.record(c1, num(3), null, 300) // a new, later snapshot arrives
    expect(store.selectedEntry()?.timestamp).toBe(300) // must advance, not stay pinned to the old "latest"
    expect(store.selectedDiff()).toEqual([{ key: "(value)", source: "state", kind: "changed", before: num(2), after: num(3) }])
  })

  it("keeps a pin on an older, explicitly-selected entry even as new snapshots arrive (task 0028)", () => {
    const store = createHistoryStore()
    store.setWatchedComponent(c1)
    store.record(c1, num(1), null, 100)
    store.record(c1, num(2), null, 200)
    store.record(c1, num(3), null, 300)
    const [first] = store.entries()
    store.selectEntry(first!.id) // NOT the latest at selection time
    store.record(c1, num(4), null, 400)
    expect(store.selectedEntry()?.timestamp).toBe(100)
  })
})

describe("containerEntries (task 0028)", () => {
  it("lists object entries in declaration order", () => {
    expect(containerEntries(obj({ a: num(1), b: num(2) }))).toEqual([
      { key: "a", node: num(1) },
      { key: "b", node: num(2) },
    ])
  })

  it("lists array items by offset-adjusted index", () => {
    expect(containerEntries(arr([num(10), num(20)]))).toEqual([
      { key: "0", node: num(10) },
      { key: "1", node: num(20) },
    ])
  })
})

describe("alignContainerEntries (task 0028)", () => {
  it("row-aligns two objects: before's key order first, then any keys only after introduced", () => {
    const before = obj({ a: num(1), b: num(2), c: num(3) })
    const after = obj({ b: num(2), c: num(9), d: num(4) })
    expect(alignContainerEntries(before, after)).toEqual([
      { key: "a", before: num(1), after: null, status: "removed" },
      { key: "b", before: num(2), after: num(2), status: "unchanged" },
      { key: "c", before: num(3), after: num(9), status: "changed" },
      { key: "d", before: null, after: num(4), status: "added" },
    ])
  })

  it("row-aligns arrays by index, including a length change (the reported Array(3) -> Array(4) case)", () => {
    const before = arr([num(1), num(2)])
    const after = arr([num(1), num(3), num(4)])
    expect(alignContainerEntries(before, after)).toEqual([
      { key: "0", before: num(1), after: num(1), status: "unchanged" },
      { key: "1", before: num(2), after: num(3), status: "changed" },
      { key: "2", before: null, after: num(4), status: "added" },
    ])
  })

  it("marks a nested-only field change as 'changed' even when the container's own size is unchanged (Array(4) -> Array(4) case)", () => {
    const before = arr([obj({ id: num(1), done: bool(false) })])
    const after = arr([obj({ id: num(1), done: bool(true) })])
    expect(alignContainerEntries(before, after)).toEqual([
      { key: "0", before: before.items[0], after: after.items[0], status: "changed" },
    ])
  })
})
