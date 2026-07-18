import type { ComponentId, ComponentRecord, InspectorSnapshot, RuntimeEvent } from "@mithril-inspector/protocol"
import { describe, expect, it } from "vitest"

import { createComponentTreeStore } from "./tree.js"

function rec(overrides: Partial<ComponentRecord> & { id: ComponentId }): ComponentRecord {
  return {
    parentId: null,
    displayName: "Comp",
    displayNameInferred: false,
    source: null,
    kind: "object",
    key: null,
    attrs: null,
    state: null,
    mounted: true,
    createdAt: 0,
    updatedAt: 0,
    updateCount: 0,
    domRange: null,
    childIds: [],
    ...overrides,
  }
}

function snapshotOf(records: ComponentRecord[]): InspectorSnapshot {
  return {
    components: new Map(records.map((r) => [r.id, r])),
    vnodes: new Map(),
    modules: new Map(),
    domAssociations: new Map(),
  }
}

describe("createComponentTreeStore (task 0022)", () => {
  it("seeds from a snapshot and exposes root-first rows via childIds order", () => {
    const store = createComponentTreeStore()
    const app = rec({ id: "c:1" as ComponentId, displayName: "App", childIds: ["c:2" as ComponentId] })
    const header = rec({ id: "c:2" as ComponentId, displayName: "Header", parentId: "c:1" as ComponentId })
    store.seed(snapshotOf([app, header]))

    const rows = store.rows()
    expect(rows.map((r) => [r.record.displayName, r.depth])).toEqual([
      ["App", 0],
      ["Header", 1],
    ])
    expect(store.size()).toBe(2)
  })

  it("applies components-added incrementally without re-seeding", () => {
    const store = createComponentTreeStore()
    store.seed(snapshotOf([rec({ id: "c:1" as ComponentId, displayName: "App" })]))

    const event: RuntimeEvent = {
      type: "components-added",
      records: [rec({ id: "c:2" as ComponentId, displayName: "Header", parentId: "c:1" as ComponentId })],
    }
    store.applyEvent(event)
    // The real runtime always accompanies a new child with a components-updated
    // patch giving its parent the fresh childIds in the same flush (task 0021's
    // visitForOwnership runs before patches are computed) — mirrored here so
    // the new child is actually reachable from the root.
    store.applyEvent({ type: "components-updated", records: [{ id: "c:1" as ComponentId, childIds: ["c:2" as ComponentId] }] })

    expect(store.recordOf("c:2" as ComponentId)?.displayName).toBe("Header")
    expect(store.rows().map((r) => r.record.displayName)).toEqual(["App", "Header"])
  })

  it("merges components-updated patches onto the existing record, preserving untouched fields", () => {
    const store = createComponentTreeStore()
    store.seed(
      snapshotOf([rec({ id: "c:1" as ComponentId, displayName: "Counter", updateCount: 0, domRange: null })]),
    )

    store.applyEvent({
      type: "components-updated",
      records: [{ id: "c:1" as ComponentId, updateCount: 3, updatedAt: 1000 }],
    })

    const record = store.recordOf("c:1" as ComponentId)
    expect(record?.updateCount).toBe(3)
    expect(record?.updatedAt).toBe(1000)
    expect(record?.displayName).toBe("Counter") // untouched field preserved
  })

  it("drops removed ids from both the store and rendered rows", () => {
    const store = createComponentTreeStore()
    store.seed(
      snapshotOf([
        rec({ id: "c:1" as ComponentId, displayName: "App", childIds: ["c:2" as ComponentId] }),
        rec({ id: "c:2" as ComponentId, displayName: "Child", parentId: "c:1" as ComponentId }),
      ]),
    )
    store.applyEvent({ type: "components-removed", ids: ["c:2" as ComponentId] })

    expect(store.recordOf("c:2" as ComponentId)).toBeUndefined()
    expect(store.rows().map((r) => r.record.displayName)).toEqual(["App"])
  })

  it("clears everything on reset", () => {
    const store = createComponentTreeStore()
    store.seed(snapshotOf([rec({ id: "c:1" as ComponentId, displayName: "App" })]))
    store.applyEvent({ type: "reset" })
    expect(store.size()).toBe(0)
    expect(store.rows()).toEqual([])
  })

  it("ignores dom-associated events (out of scope for the component tree)", () => {
    const store = createComponentTreeStore()
    store.seed(snapshotOf([rec({ id: "c:1" as ComponentId, displayName: "App" })]))
    store.applyEvent({ type: "dom-associated", records: [] })
    expect(store.size()).toBe(1)
  })

  it("handles a single batch that adds, updates and removes different components across two independent roots without cross-contamination", () => {
    // Two independent mount roots (§3.1 "multiple roots"), each with its own
    // child — mirrors realistic interleaved multi-group input rather than one
    // hand-sorted list (per this repo's TDD guidance on multi-group tests).
    const store = createComponentTreeStore()
    store.seed(
      snapshotOf([
        rec({ id: "c:1" as ComponentId, displayName: "RootA", childIds: ["c:2" as ComponentId] }),
        rec({ id: "c:2" as ComponentId, displayName: "ChildA", parentId: "c:1" as ComponentId, updateCount: 0 }),
        rec({ id: "c:10" as ComponentId, displayName: "RootB", childIds: ["c:11" as ComponentId] }),
        rec({ id: "c:11" as ComponentId, displayName: "ChildB", parentId: "c:10" as ComponentId }),
      ]),
    )

    // One flush's worth of events, deliberately out of "tidy" order: an update
    // to RootB's child, a removal from RootA's subtree, and a new grandchild
    // added under RootB — interleaved, not grouped by root.
    store.applyEvent({ type: "components-updated", records: [{ id: "c:11" as ComponentId, updateCount: 5, updatedAt: 42 }] })
    store.applyEvent({ type: "components-removed", ids: ["c:2" as ComponentId] })
    store.applyEvent({
      type: "components-added",
      records: [rec({ id: "c:12" as ComponentId, displayName: "GrandchildB", parentId: "c:11" as ComponentId })],
    })
    // RootA's and ChildB's childIds must be repatched too (their own
    // components-updated patches in the same real flush) — otherwise the
    // removed child would dangle, and the new grandchild would be unreachable.
    store.applyEvent({ type: "components-updated", records: [{ id: "c:1" as ComponentId, childIds: [] }] })
    store.applyEvent({
      type: "components-updated",
      records: [{ id: "c:11" as ComponentId, childIds: ["c:12" as ComponentId] }],
    })

    expect(store.recordOf("c:2" as ComponentId)).toBeUndefined()
    expect(store.recordOf("c:11" as ComponentId)?.updateCount).toBe(5)
    expect(store.recordOf("c:12" as ComponentId)?.displayName).toBe("GrandchildB")

    const names = store.rows().map((r) => r.record.displayName)
    expect(names).toEqual(["RootA", "RootB", "ChildB", "GrandchildB"])
  })

  describe("collapse/expand", () => {
    it("defaults every node to expanded and hides a collapsed node's subtree", () => {
      const store = createComponentTreeStore()
      store.seed(
        snapshotOf([
          rec({ id: "c:1" as ComponentId, displayName: "App", childIds: ["c:2" as ComponentId] }),
          rec({ id: "c:2" as ComponentId, displayName: "Child", parentId: "c:1" as ComponentId, childIds: ["c:3" as ComponentId] }),
          rec({ id: "c:3" as ComponentId, displayName: "Grandchild", parentId: "c:2" as ComponentId }),
        ]),
      )
      expect(store.isCollapsed("c:2" as ComponentId)).toBe(false)
      expect(store.rows().map((r) => r.record.displayName)).toEqual(["App", "Child", "Grandchild"])

      store.toggleCollapsed("c:2" as ComponentId)
      expect(store.isCollapsed("c:2" as ComponentId)).toBe(true)
      expect(store.rows().map((r) => r.record.displayName)).toEqual(["App", "Child"])

      store.toggleCollapsed("c:2" as ComponentId)
      expect(store.rows().map((r) => r.record.displayName)).toEqual(["App", "Child", "Grandchild"])
    })

    it("marks hasChildren/expanded correctly on rows", () => {
      const store = createComponentTreeStore()
      store.seed(
        snapshotOf([
          rec({ id: "c:1" as ComponentId, displayName: "App", childIds: ["c:2" as ComponentId] }),
          rec({ id: "c:2" as ComponentId, displayName: "Leaf", parentId: "c:1" as ComponentId }),
        ]),
      )
      const [appRow, leafRow] = store.rows()
      expect(appRow?.hasChildren).toBe(true)
      expect(appRow?.expanded).toBe(true)
      expect(leafRow?.hasChildren).toBe(false)
      expect(leafRow?.expanded).toBe(false)
    })
  })

  describe("search", () => {
    it("filters to matches and keeps their ancestors visible for context", () => {
      const store = createComponentTreeStore()
      store.seed(
        snapshotOf([
          rec({ id: "c:1" as ComponentId, displayName: "App", childIds: ["c:2" as ComponentId, "c:4" as ComponentId] }),
          rec({ id: "c:2" as ComponentId, displayName: "UserList", parentId: "c:1" as ComponentId, childIds: ["c:3" as ComponentId] }),
          rec({ id: "c:3" as ComponentId, displayName: "UserCard", parentId: "c:2" as ComponentId }),
          rec({ id: "c:4" as ComponentId, displayName: "Footer", parentId: "c:1" as ComponentId }),
        ]),
      )
      store.setSearch("card")
      const names = store.rows().map((r) => r.record.displayName)
      expect(names).toEqual(["App", "UserList", "UserCard"]) // Footer excluded, ancestors of the match kept
    })

    it("is case-insensitive and clears back to the full tree when the query is emptied", () => {
      const store = createComponentTreeStore()
      store.seed(
        snapshotOf([
          rec({ id: "c:1" as ComponentId, displayName: "App", childIds: ["c:2" as ComponentId] }),
          rec({ id: "c:2" as ComponentId, displayName: "UserCard", parentId: "c:1" as ComponentId }),
        ]),
      )
      store.setSearch("USERCARD")
      expect(store.rows().map((r) => r.record.displayName)).toEqual(["App", "UserCard"])
      store.setSearch("")
      expect(store.rows().map((r) => r.record.displayName)).toEqual(["App", "UserCard"])
      store.setSearch("nomatch")
      expect(store.rows()).toEqual([])
    })

    it("auto-expands a collapsed ancestor of a match while searching, without losing the manual collapse afterward", () => {
      const store = createComponentTreeStore()
      store.seed(
        snapshotOf([
          rec({ id: "c:1" as ComponentId, displayName: "App", childIds: ["c:2" as ComponentId] }),
          rec({ id: "c:2" as ComponentId, displayName: "UserList", parentId: "c:1" as ComponentId, childIds: ["c:3" as ComponentId] }),
          rec({ id: "c:3" as ComponentId, displayName: "UserCard", parentId: "c:2" as ComponentId }),
        ]),
      )
      store.toggleCollapsed("c:2" as ComponentId)
      expect(store.rows().map((r) => r.record.displayName)).toEqual(["App", "UserList"])

      store.setSearch("usercard")
      expect(store.rows().map((r) => r.record.displayName)).toEqual(["App", "UserList", "UserCard"])

      store.setSearch("")
      expect(store.rows().map((r) => r.record.displayName)).toEqual(["App", "UserList"]) // manual collapse restored
    })
  })

  describe("pinned components (§3.2)", () => {
    it("pins and unpins, listing pinned rows", () => {
      const store = createComponentTreeStore()
      store.seed(snapshotOf([rec({ id: "c:1" as ComponentId, displayName: "App" })]))
      expect(store.isPinned("c:1" as ComponentId)).toBe(false)

      store.togglePinned("c:1" as ComponentId)
      expect(store.isPinned("c:1" as ComponentId)).toBe(true)
      expect(store.pinnedRows().map((p) => p.record.displayName)).toEqual(["App"])

      store.togglePinned("c:1" as ComponentId)
      expect(store.isPinned("c:1" as ComponentId)).toBe(false)
      expect(store.pinnedRows()).toEqual([])
    })

    it("is not silently dropped when the pinned component unmounts — keeps the last-known record with mounted: false", () => {
      const store = createComponentTreeStore()
      store.seed(snapshotOf([rec({ id: "c:1" as ComponentId, displayName: "Modal", updateCount: 2 })]))
      store.togglePinned("c:1" as ComponentId)

      store.applyEvent({ type: "components-removed", ids: ["c:1" as ComponentId] })

      const pinned = store.pinnedRows()
      expect(pinned).toHaveLength(1)
      expect(pinned[0]?.mounted).toBe(false)
      expect(pinned[0]?.record.displayName).toBe("Modal") // last-known snapshot retained
      expect(pinned[0]?.record.updateCount).toBe(2)
    })

    it("keeps the pinned row's record fresh while still mounted", () => {
      const store = createComponentTreeStore()
      store.seed(snapshotOf([rec({ id: "c:1" as ComponentId, displayName: "Counter", updateCount: 0 })]))
      store.togglePinned("c:1" as ComponentId)
      store.applyEvent({ type: "components-updated", records: [{ id: "c:1" as ComponentId, updateCount: 7, updatedAt: 5 }] })

      const pinned = store.pinnedRows()
      expect(pinned[0]?.mounted).toBe(true)
      expect(pinned[0]?.record.updateCount).toBe(7)
    })
  })
})
