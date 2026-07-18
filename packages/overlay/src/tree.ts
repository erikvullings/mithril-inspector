import type { ComponentId, ComponentRecord, InspectorSnapshot, RuntimeEvent } from "@mithril-inspector/protocol"

/**
 * The Components tab's tree/search/pin/collapse model (§9, §9.4, task 0022).
 *
 * The store holds one flat `Map<ComponentId, ComponentRecord>`, seeded once
 * from `hook.getSnapshot()` and thereafter patched incrementally from batched
 * `RuntimeEvent`s (§9.4 "do not rebuild the entire UI tree on every redraw")
 * — never re-fetching the whole snapshot after the initial seed. Parent/child
 * structure comes directly from each record's own `childIds` (already
 * ordered by the runtime, task 0017/0021), so no separate child index is
 * maintained here.
 */

export interface TreeRow {
  readonly record: ComponentRecord
  readonly depth: number
  readonly hasChildren: boolean
  /** Whether this row's children are currently rendered (collapse state, or forced open while searching). */
  readonly expanded: boolean
}

/**
 * A pinned component (§3.2 "subsequent scope"). Minimal by design (Implementation
 * Notes call this acceptable): pinning just keeps a component visible and
 * flagged when it unmounts, rather than adding reordering, grouping, or
 * cross-session persistence. `mounted: false` + the last-known `record` is
 * how it avoids being "silently dropped" (§8.8-style tolerance) once the
 * component's id is gone for good (ids are never reused).
 */
export interface PinnedRow {
  readonly record: ComponentRecord
  readonly mounted: boolean
}

export interface ComponentTreeStore {
  /** Replace all tracked records from a fresh snapshot (initial seed only — never called again after `reset`). */
  seed(snapshot: InspectorSnapshot): void
  /** Apply one batched `RuntimeEvent` incrementally (§9.4). */
  applyEvent(event: RuntimeEvent): void
  /** A tracked record by id, or `undefined`. */
  recordOf(id: ComponentId): ComponentRecord | undefined
  /** Count of currently-tracked records. */
  size(): number

  setSearch(query: string): void
  getSearch(): string

  toggleCollapsed(id: ComponentId): void
  isCollapsed(id: ComponentId): boolean

  togglePinned(id: ComponentId): void
  isPinned(id: ComponentId): boolean
  /** Pinned components in pin order; unmounted ones keep their last-known record (see {@link PinnedRow}). */
  pinnedRows(): PinnedRow[]

  /** The currently-visible rows, root-first, respecting collapse state and the active search filter. */
  rows(): TreeRow[]
}

export function createComponentTreeStore(): ComponentTreeStore {
  const records = new Map<ComponentId, ComponentRecord>()
  const collapsedIds = new Set<ComponentId>()
  const pinnedIds = new Set<ComponentId>()
  // The last-known record for a pinned id, refreshed on every read while the
  // component is still mounted, retained unchanged once it unmounts.
  const pinnedFrozen = new Map<ComponentId, ComponentRecord>()
  let search = ""

  /** Every currently-tracked record whose display name matches the query, plus every one of its ancestors. */
  const computeSearchMatches = (query: string): Set<ComponentId> => {
    const visible = new Set<ComponentId>()
    const lower = query.toLowerCase()
    for (const record of records.values()) {
      if (!record.displayName.toLowerCase().includes(lower)) continue
      let current: ComponentRecord | undefined = record
      while (current !== undefined) {
        visible.add(current.id)
        current = current.parentId === null ? undefined : records.get(current.parentId)
      }
    }
    return visible
  }

  const store: ComponentTreeStore = {
    seed(snapshot) {
      records.clear()
      for (const [id, record] of snapshot.components) records.set(id, record)
    },
    applyEvent(event) {
      switch (event.type) {
        case "components-added":
          for (const record of event.records) records.set(record.id, record)
          return
        case "components-updated":
          for (const patch of event.records) {
            const existing = records.get(patch.id)
            if (existing === undefined) continue
            records.set(patch.id, { ...existing, ...patch })
          }
          return
        case "components-removed":
          for (const id of event.ids) records.delete(id)
          return
        case "dom-associated":
          return // the component tree has no use for raw DOM-association events
        case "reset":
          records.clear()
          return
      }
    },
    recordOf(id) {
      return records.get(id)
    },
    size() {
      return records.size
    },

    setSearch(query) {
      search = query
    },
    getSearch() {
      return search
    },

    toggleCollapsed(id) {
      if (collapsedIds.has(id)) collapsedIds.delete(id)
      else collapsedIds.add(id)
    },
    isCollapsed(id) {
      return collapsedIds.has(id)
    },

    togglePinned(id) {
      if (pinnedIds.has(id)) {
        pinnedIds.delete(id)
        pinnedFrozen.delete(id)
        return
      }
      pinnedIds.add(id)
      const record = records.get(id)
      if (record !== undefined) pinnedFrozen.set(id, record)
    },
    isPinned(id) {
      return pinnedIds.has(id)
    },
    pinnedRows() {
      const rows: PinnedRow[] = []
      for (const id of pinnedIds) {
        const live = records.get(id)
        if (live !== undefined) {
          pinnedFrozen.set(id, live)
          rows.push({ record: live, mounted: true })
          continue
        }
        const frozen = pinnedFrozen.get(id)
        if (frozen !== undefined) rows.push({ record: frozen, mounted: false })
      }
      return rows
    },

    rows() {
      const query = search.trim()
      const searching = query.length > 0
      const matches = searching ? computeSearchMatches(query) : null

      const rootIds: ComponentId[] = []
      for (const record of records.values()) {
        if (record.parentId === null) rootIds.push(record.id)
      }

      const out: TreeRow[] = []
      const visit = (id: ComponentId, depth: number): void => {
        const record = records.get(id)
        if (record === undefined) return
        if (matches !== null && !matches.has(id)) return
        const hasChildren = record.childIds.length > 0
        const expanded = hasChildren && (searching || !collapsedIds.has(id))
        out.push({ record, depth, hasChildren, expanded })
        if (expanded) {
          for (const childId of record.childIds) visit(childId, depth + 1)
        }
      }
      for (const id of rootIds) visit(id, 0)
      return out
    },
  }

  return store
}
