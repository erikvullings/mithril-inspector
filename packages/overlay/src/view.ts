import type { ComponentId, PreviewNode } from "@mithril-inspector/protocol"
import m from "mithril"
import type { Children, Component, Vnode } from "mithril"

import type {
  AncestryEntry,
  ComponentTreeGating,
  OverlayController,
  OverlayTab,
  OverlayViewState,
} from "./controller.js"
import type { HighlightRect } from "./highlight.js"
import {
  iconClose,
  iconCode,
  iconComponents,
  iconEye,
  iconFileText,
  iconFocus,
  iconPin,
  iconSearch,
  iconSettings,
  iconTarget,
} from "./icons.js"
import type { MappingInfo, MappingPrecision } from "./mapping.js"
import type { OverlayTheme } from "./options.js"
import { compactContainerPreview, isContainerNode, pathKey, shownCountOf, summarizeNode, totalCountOf } from "./preview.js"
import type { ContainerNode } from "./preview.js"
import { parseShortcut, PICKER_SHORTCUT_KEYS, type PickerShortcutKey, type PickerShortcutSetting } from "./shortcuts.js"
import type { PinnedRow, TreeRow } from "./tree.js"

/**
 * The overlay's Mithril view tree (§8.3). It is a pure function of
 * `controller.getState()`; all behavior is delegated to the controller, so the
 * view stays thin and the logic stays testable without the DOM.
 *
 * Layout follows a Vue-DevTools-style docked panel: an unobtrusive
 * bottom-center toggle when collapsed, and a full-width bottom-docked panel
 * with a left icon sidebar when expanded. The former Inspector/Components
 * split is merged into one view — the DOM picker and the component tree
 * write to the same shared selection, so there is only ever one place a pick
 * or a tree click shows up.
 */

const PRECISION_LABEL: Record<MappingPrecision, string> = {
  exact: "Exact",
  inferred: "Inferred",
  none: "None",
}

function rectStyle(rect: HighlightRect): string {
  return `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;`
}

function precisionBadge(mapping: MappingInfo): Vnode {
  return m(`span.mi-badge-precision.mi-precision-${mapping.precision}`, PRECISION_LABEL[mapping.precision])
}

/** Marks a component display name resolved via a §9.2 fallback tier (§2.4). */
function inferredNameBadge(): Vnode {
  return m(
    "span.mi-badge-precision.mi-precision-inferred",
    { title: "Inferred from the filename or a generic fallback — not an explicit or declared name" },
    "Inferred",
  )
}

/** A small icon button with the action's name as its only visible label — a native tooltip on hover/focus. */
function iconButton(
  icon: Vnode,
  options: {
    readonly label: string
    readonly onclick: () => void
    readonly disabled?: boolean
    readonly pressed?: boolean
    readonly compact?: boolean
    readonly extraClass?: string
  },
): Vnode {
  const classes = ["mi-icon-btn", options.compact ? "mi-icon-btn-small" : null, options.extraClass ?? null]
    .filter(Boolean)
    .join(".")
  return m(
    `button.${classes}`,
    {
      type: "button",
      title: options.label,
      "aria-label": options.label,
      disabled: options.disabled === true,
      ...(options.pressed !== undefined ? { "aria-pressed": options.pressed ? "true" : "false" } : {}),
      onclick: options.onclick,
    },
    icon,
  )
}

function highlightLayer(state: OverlayViewState): Vnode {
  const rects: Vnode[] = []
  for (const rect of state.hoverRects) rects.push(m("div.mi-rect", { style: rectStyle(rect) }))
  for (const rect of state.frozenRects) rects.push(m("div.mi-rect.mi-rect-frozen", { style: rectStyle(rect) }))
  return m("div.mi-highlight-layer", { "aria-hidden": "true" }, rects)
}

function hoverBadge(state: OverlayViewState): Children {
  if (state.hover === null || state.hoverRects.length === 0) return null
  const anchor = state.hoverRects[0]
  if (anchor === undefined) return null
  const style = `left:${anchor.left}px;top:${anchor.top + anchor.height + 6}px;`
  const { hover } = state
  return m("div.mi-hover-badge", { style, "aria-hidden": "true" }, [
    hover.componentName
      ? m("div.mi-hb-component", [
          hover.componentName.name,
          hover.componentName.inferred ? [" ", inferredNameBadge()] : null,
        ])
      : null,
    m("div.mi-hb-element", hover.element),
    hover.mapping.fileLine ? m("div.mi-hb-source", hover.mapping.fileLine) : null,
  ])
}

function pickingBanner(state: OverlayViewState): Children {
  if (!state.pickingBannerVisible) return null
  return m(
    "div.mi-picking-banner",
    { role: "status", "aria-live": "polite" },
    "Inspecting — click to select, Cmd/Win+click to open in editor, Esc to cancel",
  )
}

/** The unobtrusive bottom-center toggle (§8.1): an "M" mark by default; hovering (or active picking) reveals a target/crosshair icon for picking straight from the collapsed state, with a glow. */
function collapsedToggle(controller: OverlayController, state: OverlayViewState): Vnode {
  return m(
    "div.mi-toggle",
    { class: state.picking ? "mi-toggle-active" : undefined },
    [
      m(
        "button.mi-toggle-btn",
        {
          type: "button",
          title: "Open Mithril Inspector",
          "aria-label": "Open Mithril Inspector",
          onclick: () => controller.setCollapsed(false),
        },
        "M",
      ),
      m(
        "button.mi-toggle-btn.mi-toggle-pick.mi-picker-btn",
        {
          type: "button",
          class: state.picking ? "mi-active" : undefined,
          title: state.picking ? "Stop inspecting" : "Pick an element",
          "aria-label": state.picking ? "Stop inspecting" : "Pick an element",
          "aria-pressed": state.picking ? "true" : "false",
          disabled: !controller.options.picker.enabled,
          onclick: (event: Event) => {
            event.stopPropagation()
            controller.togglePicker()
          },
        },
        iconTarget(),
      ),
    ],
  )
}

function staleNotice(controller: OverlayController): Vnode {
  const ancestor = controller.getState().selection.node
  return m("div.mi-stale", { role: "status" }, [
    m("div", "Element no longer mounted."),
    m(
      "button.mi-btn",
      {
        type: "button",
        style: "margin-top:6px;",
        disabled: ancestor === null,
        onclick: () => controller.promoteStaleSelection(),
      },
      "Select nearest mounted ancestor",
    ),
  ])
}

function describeSelected(state: OverlayViewState): string {
  const node = state.selection.node
  if (node === null) return "—"
  const tag = node.tagName.toLowerCase()
  const classes = Array.from(node.classList)
    .map((c) => `.${c}`)
    .join("")
  return `${tag}${classes}`
}

/** The picked element's tag/class + source file:line + mapping precision, compact enough for one line above the breadcrumb. */
function selectionMeta(state: OverlayViewState): Vnode {
  const { mapping } = state.selection
  return m("div.mi-detail-meta", [
    m("span.mi-mono", describeSelected(state)),
    mapping.fileLine ? m("span.mi-mono.mi-muted", mapping.fileLine) : m("span.mi-muted", "unknown source"),
    precisionBadge(mapping),
  ])
}

/**
 * The ancestry breadcrumb (§8.3, §9.1): root-first, each crumb a click target
 * that highlights that ancestor's own DOM range (`focusAncestor`) without
 * changing the shared selection — the toolbar's actions stay scoped to the
 * actually-selected/picked component throughout.
 */
function ancestryBreadcrumb(controller: OverlayController, state: OverlayViewState): Vnode {
  if (state.ancestry.length === 0) {
    return m("p.mi-muted", "No owning component resolved for this element.")
  }
  // Each entry renders as one keyed group (separator + button) rather than
  // interleaving keyed buttons with unkeyed separators as flat siblings —
  // Mithril requires a fragment's children to be either all keyed or all
  // unkeyed, and mixing the two throws at render time.
  const crumbs = state.ancestry.map((entry, index) => {
    const isLast = index === state.ancestry.length - 1
    const focused = entry.id === state.focusedAncestorId
    return m("span", { key: entry.id }, [
      index > 0 ? m("span.mi-breadcrumb-sep", "›") : null,
      m(
        "button.mi-crumb",
        {
          type: "button",
          class: [isLast ? "mi-crumb-current" : null, focused ? "mi-crumb-focused" : null].filter(Boolean).join(" ") || undefined,
          onclick: () => controller.focusAncestor(entry.id),
        },
        [
          entry.name.name,
          entry.key !== null
            ? m("span.mi-tree-key.mi-mono", ` key=${typeof entry.key === "string" ? `"${entry.key}"` : entry.key}`)
            : null,
          entry.name.inferred ? [" ", inferredNameBadge()] : null,
          !entry.mounted ? [" ", m("span.mi-muted", "(not mounted)")] : null,
        ],
      ),
    ])
  })
  return m("div.mi-breadcrumb", crumbs)
}

/**
 * The action row (§9.3): one icon per action, the former label now only a
 * tooltip. "Open in editor" always covers the exact clicked element's own
 * source (`selection.mapping`) — the same target the ancestry-choice group's
 * "Rendered element" entry used to duplicate for the selected component
 * itself, so that icon is never shown redundantly there. `sourceEntry` is
 * whichever ancestry entry a breadcrumb crumb last focused, or the selection
 * itself when none is — its own "element" location only gets a separate icon
 * when it's a *different* component than the selection (focusing an
 * ancestor is exactly how you'd want to reach that ancestor's own rendered
 * element, view, and declaration, task 0019). Pin/scroll/clear stay bound to
 * the actual selection regardless of which ancestor is focused.
 */
function detailToolbar(
  controller: OverlayController,
  state: OverlayViewState,
  componentId: ComponentId,
  sourceEntry: AncestryEntry,
): Vnode {
  const { mapping } = state.selection
  const { choices } = sourceEntry
  const element = sourceEntry.id !== componentId ? choices.find((c) => c.kind === "element") : undefined
  const view = choices.find((c) => c.kind === "view")
  const declaration = choices.find((c) => c.kind === "declaration")
  const pinned = state.componentTree.pinned.some((p) => p.record.id === componentId)
  return m("div.mi-toolbar", [
    iconButton(iconCode(), {
      label: "Open in editor",
      disabled: mapping.fileLine === null,
      onclick: () => controller.openSelectedInEditor(),
    }),
    element !== undefined
      ? iconButton(iconCode(), { label: `${element.label} (${sourceEntry.name.name})`, onclick: () => controller.revealComponent(sourceEntry.id, "element") })
      : null,
    view !== undefined
      ? iconButton(iconEye(), { label: view.label, onclick: () => controller.revealComponent(sourceEntry.id, "view") })
      : null,
    declaration !== undefined
      ? iconButton(iconFileText(), { label: declaration.label, onclick: () => controller.revealComponent(sourceEntry.id, "declaration") })
      : null,
    m("span.mi-toolbar-divider"),
    iconButton(iconPin(), {
      label: pinned ? "Unpin component" : "Pin component",
      pressed: pinned,
      onclick: () => controller.togglePinned(componentId),
    }),
    iconButton(iconFocus(), {
      label: "Scroll into view",
      onclick: () => controller.scrollComponentIntoView(componentId),
    }),
    iconButton(iconClose(), {
      label: "Clear selection",
      onclick: () => controller.clearSelection(),
    }),
  ])
}

/** `key="42"` badge (§9.1 example), only rendered when the vnode actually carries a key. */
function treeKeyBadge(record: TreeRow["record"]): Children {
  if (record.key === null) return null
  const value = typeof record.key === "string" ? `"${record.key}"` : record.key
  return m("span.mi-tree-key.mi-mono", ` key=${value}`)
}

/** Update-counter badge (§3.2), hidden until a component has actually redrawn at least once. */
function updateCountBadge(record: TreeRow["record"]): Children {
  if (record.updateCount <= 0) return null
  return m("span.mi-badge-count", { title: `Updated ${record.updateCount} time(s)` }, `×${record.updateCount}`)
}

function pinButton(controller: OverlayController, id: ComponentId, pinned: boolean): Vnode {
  return m(
    "button.mi-btn-small.mi-pin-btn",
    {
      type: "button",
      "aria-pressed": pinned ? "true" : "false",
      "aria-label": pinned ? "Unpin component" : "Pin component",
      title: pinned ? "Unpin component" : "Pin component",
      onclick: (event: Event) => {
        event.stopPropagation()
        controller.togglePinned(id)
      },
    },
    iconPin(),
  )
}

/** Moves DOM focus to the tree row for `id` within the same `role=tree` container as `origin` (roving tabindex, §18). */
function focusTreeRow(origin: EventTarget | null, id: ComponentId): void {
  const el = origin instanceof Element ? origin.closest('[role="tree"]') : null
  const row = el?.querySelector(`[data-mi-tree-id="${id}"]`)
  if (row instanceof HTMLElement) row.focus()
}

/** Arrow-key/Enter navigation over the flattened row list (§18 "keyboard expand/collapse/navigate"). */
function handleTreeKeyDown(controller: OverlayController, rows: readonly TreeRow[], index: number, event: KeyboardEvent): void {
  const row = rows[index]
  if (row === undefined) return
  switch (event.key) {
    case "ArrowDown": {
      event.preventDefault()
      const next = rows[index + 1]
      if (next !== undefined) focusTreeRow(event.currentTarget, next.record.id)
      return
    }
    case "ArrowUp": {
      event.preventDefault()
      const previous = rows[index - 1]
      if (previous !== undefined) focusTreeRow(event.currentTarget, previous.record.id)
      return
    }
    case "ArrowRight": {
      event.preventDefault()
      if (!row.hasChildren) return
      if (!row.expanded) {
        controller.toggleTreeNode(row.record.id)
        return
      }
      const child = rows[index + 1]
      if (child !== undefined) focusTreeRow(event.currentTarget, child.record.id)
      return
    }
    case "ArrowLeft": {
      event.preventDefault()
      if (row.hasChildren && row.expanded) {
        controller.toggleTreeNode(row.record.id)
        return
      }
      if (row.record.parentId !== null) focusTreeRow(event.currentTarget, row.record.parentId)
      return
    }
    case "Enter":
    case " ": {
      event.preventDefault()
      controller.selectComponent(row.record.id)
      return
    }
    default:
  }
}

/** One `role=treeitem` row — a flat list with `aria-level` for depth, not physically nested `role=group`s (§18). */
function treeRow(
  controller: OverlayController,
  state: OverlayViewState,
  rows: readonly TreeRow[],
  index: number,
  focusedId: ComponentId | null,
): Vnode {
  const row = rows[index]!
  const { record } = row
  const selected = state.selection.componentId === record.id
  const isRovingTarget = focusedId === null ? index === 0 : focusedId === record.id
  return m(
    "li",
    {
      key: record.id,
      role: "treeitem",
      "data-mi-tree-id": record.id,
      "aria-level": row.depth + 1,
      "aria-selected": selected ? "true" : "false",
      ...(row.hasChildren ? { "aria-expanded": row.expanded ? "true" : "false" } : {}),
      tabindex: isRovingTarget ? 0 : -1,
      class: selected ? "mi-tree-row-selected" : undefined,
      onkeydown: (event: KeyboardEvent) => handleTreeKeyDown(controller, rows, index, event),
      onclick: () => controller.selectComponent(record.id),
    },
    m("div.mi-tree-row", { style: `padding-left:${row.depth * 14}px;` }, [
      row.hasChildren
        ? m(
            "button.mi-tree-chevron",
            {
              type: "button",
              title: row.expanded ? "Collapse" : "Expand",
              "aria-label": row.expanded ? "Collapse" : "Expand",
              onclick: (event: Event) => {
                event.stopPropagation()
                controller.toggleTreeNode(record.id)
              },
            },
            row.expanded ? "▾" : "▸",
          )
        : m("span.mi-tree-chevron-spacer"),
      m("span.mi-tree-name", [
        record.displayName,
        record.displayNameInferred ? [" ", inferredNameBadge()] : null,
        treeKeyBadge(record),
      ]),
      updateCountBadge(record),
      pinButton(controller, record.id, state.componentTree.pinned.some((p) => p.record.id === record.id)),
    ]),
  )
}

/** The `role=tree` component hierarchy list (§9.1) — excludes plain HTML elements by construction (records are components only). */
function treeList(controller: OverlayController, state: OverlayViewState): Vnode {
  const { rows } = state.componentTree
  if (rows.length === 0) {
    return m("p.mi-empty", state.componentTree.search.trim() !== "" ? "No components match your search." : "No components tracked yet.")
  }
  const focusedId = state.selection.componentId
  return m(
    "ul.mi-tree",
    { role: "tree", "aria-label": "Component hierarchy" },
    rows.map((_row, index) => treeRow(controller, state, rows, index, focusedId)),
  )
}

function pinnedRow(controller: OverlayController, pinned: PinnedRow): Vnode {
  const { record } = pinned
  return m("li", { key: record.id }, [
    m(
      "button.mi-crumb",
      { type: "button", disabled: !pinned.mounted, onclick: () => controller.selectComponent(record.id) },
      record.displayName,
    ),
    treeKeyBadge(record),
    !pinned.mounted ? [" ", m("span.mi-muted", "(not mounted)")] : null,
    pinButton(controller, record.id, true),
  ])
}

/** Pinned components (§3.2) — kept visible (with a "not mounted" marker) rather than silently dropped when unmounted. */
function pinnedSection(controller: OverlayController, state: OverlayViewState): Children {
  if (state.componentTree.pinned.length === 0) return null
  return [
    m("div.mi-section-title", "Pinned"),
    m("ul.mi-pinned", state.componentTree.pinned.map((p) => pinnedRow(controller, p))),
  ]
}

/** Search input plus a trailing picker icon (§8.4) — starting a pick from the tree pane, not a separate header. */
/**
 * The picker-activation icon (§8.4). Pulled out of `treeSearchRow` so it can
 * also appear when the tree pane is showing its "tracking disabled" message
 * instead — DOM picking is independent of `componentTree.enabled` (always
 * was, back when this was the separate Inspector tab) and must stay reachable
 * from the expanded panel either way, not only when the tree happens to be on.
 */
function pickerIconButton(controller: OverlayController, state: OverlayViewState): Vnode {
  return iconButton(iconTarget(), {
    label: state.picking ? "Stop inspecting" : "Select an element",
    pressed: state.picking,
    disabled: !controller.options.picker.enabled,
    extraClass: "mi-picker-btn",
    onclick: () => controller.togglePicker(),
    compact: true,
  })
}

function treeSearchRow(controller: OverlayController, state: OverlayViewState): Vnode {
  return m("div.mi-search-row", [
    m("span.mi-search-icon", { "aria-hidden": "true" }, iconSearch()),
    m("input.mi-tree-search", {
      type: "search",
      placeholder: "Find components…",
      "aria-label": "Search components by name",
      value: state.componentTree.search,
      oninput: (event: Event) => controller.setTreeSearch((event.target as HTMLInputElement).value),
    }),
    pickerIconButton(controller, state),
  ])
}

/** Everything `previewNodeView`/`previewEntries` thread through a recursive render pass. */
interface PreviewContext {
  readonly controller: OverlayController
  readonly target: "attrs" | "state"
  readonly overrides: ReadonlyMap<string, PreviewNode>
  /** `pathKey`s of nested containers the user has locally expanded past their default collapsed preview. */
  readonly expandedPaths: ReadonlySet<string>
}

/**
 * Renders one entry's label + value for an object/map/array/set/typed-array
 * container. The root section (§8.3's Attrs/State) renders each as its own
 * full-width `<li>` row, matching the panel's existing top-level field list.
 * A nested (non-root) container instead renders each as an inline
 * `span.mi-preview-entry` (comma-separated via CSS, styles.ts) so the whole
 * expanded entry — its "key:"/index label, toggle, and fields — reads as one
 * flowing, wrapping line, the same as the collapsed compact preview it
 * replaces, rather than a rigid one-field-per-row list.
 */
function previewEntries(ctx: PreviewContext, node: PreviewNode, flow: boolean): Children {
  const tag = flow ? "span.mi-preview-entry" : "li"
  switch (node.kind) {
    case "object":
      return node.entries.map((entry) =>
        m(tag, { key: entry.key }, [m("span.mi-preview-key", `${entry.key}: `), previewNodeView(ctx, entry.node)]),
      )
    case "map":
      return node.entries.map((entry, i) =>
        m(tag, { key: node.offset + i }, [
          previewNodeView(ctx, entry.key),
          m("span.mi-preview-key", " => "),
          previewNodeView(ctx, entry.value),
        ]),
      )
    case "array":
    case "typed-array":
      return node.items.map((item, i) =>
        m(tag, { key: node.offset + i }, [m("span.mi-preview-key", `${node.offset + i}: `), previewNodeView(ctx, item)]),
      )
    case "set":
      return node.items.map((item, i) => m(tag, { key: node.offset + i }, previewNodeView(ctx, item)))
    default:
      return null
  }
}

/** The "Show more (N more)" pagination round-trip button for a truncated container's next page (§7.4). */
function showMoreButton(ctx: PreviewContext, node: ContainerNode, effective: ContainerNode): Children {
  if (!effective.truncated) return null
  const shown = shownCountOf(effective)
  const remaining = totalCountOf(effective) - (effective.offset + shown)
  return m(
    "button.mi-btn.mi-btn-small",
    {
      type: "button",
      onclick: () => ctx.controller.expandComponentPreview(ctx.target, node.path, { offset: effective.offset + shown }),
    },
    `Show more (${remaining} more)`,
  )
}

/**
 * A nested (non-root) container's default, collapsed state (§7.4): a flat
 * "+" toggle plus a one-line devtools-style preview of its already-loaded
 * shallow contents (e.g. `{ id: 1, label: "Write the changelog", done: false
 * }`) — built locally from `compactContainerPreview`, no fetch needed — so
 * the contents are visible without expanding at all. Expanding is then a
 * pure local UI toggle (`togglePreviewExpanded`), independent of the
 * fetch-driven `attrsOverrides`/`stateOverrides` round-trip used only for
 * data past `maxDepth`/`maxEntries`.
 */
function collapsedContainerPreview(ctx: PreviewContext, node: ContainerNode, effective: ContainerNode): Vnode {
  return m("span.mi-preview-collapsed", [
    m(
      "button.mi-preview-toggle",
      {
        type: "button",
        title: "Expand",
        "aria-label": "Expand",
        onclick: () => ctx.controller.togglePreviewExpanded(ctx.target, node.path),
      },
      "+",
    ),
    m("span.mi-preview-inline", compactContainerPreview(effective)),
  ])
}

/**
 * The "−" collapse toggle for an expanded, non-root container. Returned as a
 * standalone sibling (not wrapped together with the `<ul>` below) so it lands
 * in the very same flex-row position its "+" counterpart had while collapsed
 * — right after the "key: " label, on the same line — rather than the
 * `<ul>`'s own block layout pushing it down.
 */
function collapseToggleButton(ctx: PreviewContext, node: ContainerNode): Vnode {
  return m(
    "button.mi-preview-toggle",
    {
      type: "button",
      title: "Collapse",
      "aria-label": "Collapse",
      onclick: () => ctx.controller.togglePreviewExpanded(ctx.target, node.path),
    },
    "−",
  )
}

/**
 * Recursively renders one preview node (§7.4), fetching getter/max-depth/pagination
 * expansions on demand. The root container (§8.3's Attrs/State section) always
 * shows its rows directly, with no type-label line and no collapse toggle — see
 * `previewSection`. Any other, nested container defaults to the collapsed
 * one-line preview above and only shows its expanded row list (again with no
 * redundant "Object"/"Array(3)" label, since the rows already convey that)
 * once the user has explicitly toggled it open.
 *
 * Returns `Children` rather than a single `Vnode`: an expanded non-root
 * container's toggle button and its `<ul>` of rows are returned as sibling
 * items (not one wrapping element) so they land directly in the entry's own
 * `<li>` — a flex row — letting the toggle stay put right after "key: " while
 * the `<ul>` wraps onto its own indented line below (§7.4's `flex-basis: 100%`
 * on `.mi-preview-entries`, see styles.ts).
 */
function previewNodeView(ctx: PreviewContext, node: PreviewNode, isRoot = false): Children {
  if (node.kind === "getter" || node.kind === "max-depth") {
    const resolved = ctx.overrides.get(pathKey(node.path))
    if (resolved !== undefined) return previewNodeView(ctx, resolved, isRoot)
    return m("span.mi-preview-getter", [
      m("span.mi-muted", summarizeNode(node)),
      m(
        "button.mi-btn.mi-btn-small",
        { type: "button", onclick: () => ctx.controller.expandComponentPreview(ctx.target, node.path) },
        node.kind === "getter" ? "Evaluate" : "Expand",
      ),
    ])
  }
  if (isContainerNode(node)) {
    const paged = node.truncated ? ctx.overrides.get(pathKey(node.path)) : undefined
    const effective = paged !== undefined && isContainerNode(paged) ? paged : node
    if (!isRoot && !ctx.expandedPaths.has(pathKey(node.path))) {
      return collapsedContainerPreview(ctx, node, effective)
    }
    if (isRoot) {
      const entriesList = m("ul.mi-preview-entries.mi-preview-root", previewEntries(ctx, effective, false))
      return m("div.mi-preview-node", [entriesList, showMoreButton(ctx, node, effective)])
    }
    return [collapseToggleButton(ctx, node), previewEntries(ctx, effective, true), showMoreButton(ctx, node, effective)]
  }
  if (node.kind === "component" && node.location !== null) {
    const location = node.location
    return m(
      "button.mi-preview-value.mi-preview-component-link",
      { type: "button", title: "Open in editor", onclick: () => ctx.controller.openLocationInEditor(location) },
      summarizeNode(node),
    )
  }
  return m("span.mi-preview-value", summarizeNode(node))
}

/** One of the two gating reasons attrs/state can be unavailable, or `null` when available (§11.1, §17). */
function previewGateMessage(gating: ComponentTreeGating, label: string): string | null {
  if (!gating.fullMode) return `Enable mode: "full" to inspect ${label}.`
  const captured = label === "attrs" ? gating.captureAttrs : gating.captureState
  if (!captured) return `${label} capture is disabled (componentTree.capture${label === "attrs" ? "Attrs" : "State"}).`
  return null
}

function previewSection(controller: OverlayController, state: OverlayViewState, target: "attrs" | "state"): Children {
  const { componentTree } = state
  const label = target === "attrs" ? "attrs" : "state"
  const gateMessage = previewGateMessage(componentTree.gating, label)
  if (gateMessage !== null) return m("p.mi-muted", gateMessage)
  const node = target === "attrs" ? componentTree.attrsPreview : componentTree.statePreview
  const overrides = target === "attrs" ? componentTree.attrsOverrides : componentTree.stateOverrides
  const expandedPaths = target === "attrs" ? componentTree.expandedAttrsPaths : componentTree.expandedStatePaths
  if (node === null) return m("p.mi-muted", `No ${label} available.`)
  // An empty, non-truncated container (no props/fields at all) reads more
  // clearly as an explicit "none" than as a bare, content-free "Object".
  if (isContainerNode(node) && !node.truncated && shownCountOf(node) === 0) {
    return m("p.mi-muted", `No ${label}.`)
  }
  return previewNodeView({ controller, target, overrides, expandedPaths }, node, true)
}

/** The left pane: search, pinned, and the component tree — independent of whether a component is selected. */
function treePane(controller: OverlayController, state: OverlayViewState): Vnode {
  const { gating } = state.componentTree
  if (!gating.enabled) {
    return m("div.mi-tree-pane", [
      m("div.mi-search-row", [pickerIconButton(controller, state)]),
      m("p.mi-muted", "Component tree tracking is disabled."),
      m(
        "p.mi-muted",
        'Set componentTree.enabled (and mode: "components" or "full") in the Vite plugin options to see the full tree (§11.1).',
      ),
    ])
  }
  return m("div.mi-tree-pane", [treeSearchRow(controller, state), pinnedSection(controller, state), treeList(controller, state)])
}

/** The right pane: the selected component's breadcrumb, actions, and attrs/state — merges the former Inspector tab in place. */
function detailPane(controller: OverlayController, state: OverlayViewState): Vnode {
  const { selection } = state
  if (selection.node === null) {
    if (selection.stale) return m("div.mi-detail-pane", [staleNotice(controller)])
    return m("div.mi-detail-pane.mi-detail-empty", [
      m("p.mi-muted", "No component selected."),
      m("p.mi-muted", "Pick an element on the page, or choose a component from the tree."),
    ])
  }

  const self = state.ancestry[state.ancestry.length - 1]
  const componentId = selection.componentId
  // Whichever crumb `focusAncestor` last highlighted, falling back to the
  // selection itself — see `detailToolbar`'s doc comment.
  const sourceEntry = state.ancestry.find((entry) => entry.id === state.focusedAncestorId) ?? self

  return m("div.mi-detail-pane", [
    selection.stale ? staleNotice(controller) : null,
    selectionMeta(state),
    self === undefined
      ? // Same empty `ancestry`, two different causes worth distinguishing:
        // a `componentId` that was resolved at pick time but the hook no
        // longer reports (the instance untracked since) versus a DOM click
        // that never resolved an owning component at all (§8.8-style).
        m("p.mi-muted", componentId !== null ? "Component is no longer tracked." : "No owning component resolved for this element.")
      : [
          ancestryBreadcrumb(controller, state),
          componentId !== null && sourceEntry !== undefined
            ? detailToolbar(controller, state, componentId, sourceEntry)
            : null,
          state.componentTree.gating.enabled
            ? [
                m("div.mi-section-title", "Attrs"),
                previewSection(controller, state, "attrs"),
                m("div.mi-section-title", "State"),
                previewSection(controller, state, "state"),
              ]
            : null,
        ],
  ])
}

const PICKER_SHORTCUT_LABELS: Record<PickerShortcutKey, string> = {
  toggleShortcut: "Toggle",
  holdShortcut: "Hold",
  openShortcut: "Open",
  cancelShortcut: "Cancel",
  openEditorModifier: "Open editor on click",
  passThroughModifier: "Pass-through",
}

/** Whether a shortcut still matches the app-configured value from `options.picker` (both the raw string and its implied enabled state) — controls the "Reset" button's visibility. */
function isDefaultShortcut(controller: OverlayController, key: PickerShortcutKey, setting: PickerShortcutSetting): boolean {
  const configuredValue = controller.options.picker[key]
  const configuredEnabled = parseShortcut(configuredValue) !== null
  return setting.value === configuredValue && setting.enabled === configuredEnabled
}

/** One rebindable shortcut row (Settings tab): an enable checkbox, its label, a live-editable text input, and — once changed — a button to revert to the app-configured default. */
function shortcutRow(controller: OverlayController, key: PickerShortcutKey, setting: PickerShortcutSetting): Vnode {
  const label = PICKER_SHORTCUT_LABELS[key]
  return m("div.mi-shortcut-row", [
    m("input.mi-shortcut-enabled", {
      type: "checkbox",
      checked: setting.enabled,
      title: setting.enabled ? `Disable ${label}` : `Enable ${label}`,
      "aria-label": setting.enabled ? `Disable ${label}` : `Enable ${label}`,
      onclick: (event: Event) => controller.setPickerShortcutEnabled(key, (event.target as HTMLInputElement).checked),
    }),
    m("span.mi-key", label),
    m("input.mi-shortcut-input.mi-mono", {
      type: "text",
      value: setting.value,
      disabled: !setting.enabled,
      spellcheck: false,
      "aria-label": `${label} shortcut`,
      oninput: (event: Event) => controller.setPickerShortcutValue(key, (event.target as HTMLInputElement).value),
    }),
    isDefaultShortcut(controller, key, setting)
      ? null
      : m(
          "button.mi-btn-small",
          { type: "button", title: "Reset to default", onclick: () => controller.resetPickerShortcut(key) },
          "Reset",
        ),
  ])
}

/** Toggle for the picking-active banner (§18) — a plain on/off, unlike the shortcut rows above (nothing to type or reset). */
function bannerToggleRow(controller: OverlayController, state: OverlayViewState): Vnode {
  return m("div.mi-row-check", [
    m("input#mi-show-banner", {
      type: "checkbox",
      checked: state.showPickingBanner,
      onclick: (event: Event) => controller.setShowPickingBanner((event.target as HTMLInputElement).checked),
    }),
    m("label", { for: "mi-show-banner" }, 'Show the "Inspecting…" banner while picking (auto-hides after a few seconds)'),
  ])
}

function settingsView(controller: OverlayController, state: OverlayViewState): Vnode {
  return m("div.mi-settings", [
    m("div.mi-section-title", "Shortcuts"),
    m("p.mi-muted", "Rebind or disable any shortcut below — e.g. if your app already uses it. Changes apply immediately and persist across reloads."),
    PICKER_SHORTCUT_KEYS.map((key) => shortcutRow(controller, key, state.pickerShortcuts[key])),
    bannerToggleRow(controller, state),
    m("hr.mi-hr"),
    m("div.mi-section-title", "Diagnostics"),
    diagnosticsView(state),
  ])
}

function diagnosticsView(state: OverlayViewState): Vnode {
  if (state.diagnostics.length === 0) {
    return m("p.mi-empty", "No inspector errors recorded.")
  }
  return m(
    "ul.mi-diagnostics",
    state.diagnostics
      .slice()
      .reverse()
      .map((d) =>
        m("li", [m("span.mi-diag-feature", `${d.feature}: `), m("span", d.message)]),
      ),
  )
}

function sidebarButton(icon: Vnode, options: { readonly label: string; readonly active?: boolean; readonly onclick: () => void }): Vnode {
  return m(
    "button.mi-sidebar-btn",
    {
      type: "button",
      title: options.label,
      "aria-label": options.label,
      "aria-pressed": options.active === true ? "true" : "false",
      onclick: options.onclick,
    },
    icon,
  )
}

/** The left icon strip (§8.3): the "M" mark collapses back to the toggle (mirroring the Vue-DevTools "click the logo to close" convention), then one entry per section. */
function sidebar(controller: OverlayController, tab: OverlayTab, setTab: (tab: OverlayTab) => void): Vnode {
  return m("nav.mi-sidebar", { "aria-label": "Mithril Inspector sections" }, [
    m(
      "button.mi-sidebar-logo",
      { type: "button", title: "Collapse Mithril Inspector", "aria-label": "Collapse Mithril Inspector", onclick: () => controller.setCollapsed(true) },
      "M",
    ),
    sidebarButton(iconComponents(), { label: "Components", active: tab === "components", onclick: () => setTab("components") }),
    m("div.mi-sidebar-spacer"),
    sidebarButton(iconSettings(), { label: "Settings", active: tab === "settings", onclick: () => setTab("settings") }),
  ])
}

function dockedPanel(controller: OverlayController, state: OverlayViewState): Vnode {
  const body =
    state.activeTab === "settings"
      ? settingsView(controller, state)
      : m("div.mi-main", [treePane(controller, state), detailPane(controller, state)])

  return m(
    "section.mi-dock",
    { role: "dialog", "aria-label": "Mithril Inspector" },
    [sidebar(controller, state.activeTab, (tab) => controller.setActiveTab(tab)), body],
  )
}

function resolveThemeAttr(theme: OverlayTheme): string | undefined {
  return theme === "system" ? undefined : theme
}

/** The root overlay component; construct one per mount with its controller. */
export function OverlayRoot(controller: OverlayController): Component<Record<string, never>, Record<string, never>> {
  return {
    view() {
      const state = controller.getState()
      const themeAttr = resolveThemeAttr(controller.options.theme)
      const rootAttrs: Record<string, unknown> = {
        class: "mi-root",
        style: `--mi-z:${controller.options.zIndex};`,
      }
      if (themeAttr !== undefined) rootAttrs["data-theme"] = themeAttr

      return m("div", rootAttrs, [
        highlightLayer(state),
        hoverBadge(state),
        pickingBanner(state),
        state.collapsed ? collapsedToggle(controller, state) : dockedPanel(controller, state),
      ])
    },
  }
}
