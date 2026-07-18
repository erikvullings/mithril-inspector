import type { ComponentId, PreviewNode } from "@mithril-inspector/protocol"
import m from "mithril"
import type { Children, Component, Vnode } from "mithril"

import type {
  AncestryEntry,
  ComponentTreeGating,
  OverlayController,
  OverlayTab,
  OverlayViewState,
  SourceChoice,
} from "./controller.js"
import { beginDrag, type DragPointerEvent } from "./drag.js"
import type { HighlightRect } from "./highlight.js"
import type { MappingInfo, MappingPrecision } from "./mapping.js"
import type { OverlayTheme } from "./options.js"
import { pathKey, summarizeNode } from "./preview.js"
import type { PinnedRow, TreeRow } from "./tree.js"

/**
 * The overlay's Mithril view tree (§8.3). It is a pure function of
 * `controller.getState()`; all behavior is delegated to the controller, so the
 * view stays thin and the logic stays testable without the DOM.
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

/**
 * "Reveal component" (§8.3 mockup, §9.3): opens the most-precise available
 * source for a component. Disabled when nothing resolved at all (§2.4).
 */
function revealButton(controller: OverlayController, id: ComponentId, choices: readonly SourceChoice[]): Vnode {
  return m(
    "button.mi-btn",
    {
      type: "button",
      disabled: choices.length === 0,
      onclick: () => controller.revealComponent(id),
    },
    "Reveal component",
  )
}

/**
 * The §9.3 "Open: rendered element / component view / component
 * declaration" choice — only rendered when more than one location actually
 * resolved (§2.4 degrade); the default (`revealButton`) already covers the
 * single/none cases.
 */
function revealChoiceGroup(controller: OverlayController, id: ComponentId, choices: readonly SourceChoice[]): Children {
  if (choices.length <= 1) return null
  return m("div.mi-reveal-choices", [
    m("span.mi-muted", "Open: "),
    choices.map((choice) =>
      m(
        "button.mi-btn.mi-btn-small",
        { type: "button", key: choice.kind, onclick: () => controller.revealComponent(id, choice.kind) },
        [choice.label, " ", precisionBadge(choice.mapping)],
      ),
    ),
  ])
}

/** One row of the ancestry list (§8.3 example, §9.1); indentation shows depth. */
function ancestryRow(controller: OverlayController, entry: AncestryEntry, depth: number, focused: boolean): Vnode {
  return m(
    "li",
    { key: entry.id, class: focused ? "mi-ancestry-focused" : undefined },
    m("div", { style: `padding-left:${depth * 14}px;` }, [
      depth > 0 ? m("span.mi-depth", "└─ ") : null,
      m(
        "button.mi-ancestry-name",
        { type: "button", onclick: () => controller.focusAncestor(entry.id) },
        entry.name.name,
      ),
      entry.name.inferred ? [" ", inferredNameBadge()] : null,
      !entry.mounted ? [" ", m("span.mi-muted", "(not mounted)")] : null,
      m("div.mi-ancestry-actions", [
        revealButton(controller, entry.id, entry.choices),
        revealChoiceGroup(controller, entry.id, entry.choices),
      ]),
    ]),
  )
}

/** The "Component ancestry" section (§8.3, §9.1) — resolved display names, root-first. */
function ancestrySection(controller: OverlayController, state: OverlayViewState): Vnode {
  if (state.ancestry.length === 0) {
    return m("p.mi-muted", "No owning component resolved for this element.")
  }
  return m(
    "ul.mi-ancestry",
    state.ancestry.map((entry, depth) => ancestryRow(controller, entry, depth, entry.id === state.focusedAncestorId)),
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
  if (!state.picking) return null
  return m(
    "div.mi-picking-banner",
    { role: "status", "aria-live": "polite" },
    "Inspecting — click to select, Esc to cancel",
  )
}

/** `transform: translate(...)` for the persisted drag offset (§8.1), or "". */
function offsetStyle(state: OverlayViewState): string {
  return state.offset === null ? "" : `transform:translate(${state.offset.x}px,${state.offset.y}px);`
}

function collapsedTab(controller: OverlayController, state: OverlayViewState): Vnode {
  return m(
    "button.mi-tab",
    {
      type: "button",
      style: offsetStyle(state),
      "aria-label": "Open Mithril Inspector panel",
      onpointerdown: (event: DragPointerEvent) => beginDrag(event, controller),
      onclick: () => controller.setCollapsed(false),
    },
    [m("span.mi-diamond", { "aria-hidden": "true" }, "◇"), "Mithril Inspect"],
  )
}

function pickerButton(controller: OverlayController, state: OverlayViewState): Vnode {
  return m(
    "button.mi-btn",
    {
      type: "button",
      "aria-pressed": state.picking ? "true" : "false",
      disabled: !controller.options.picker.enabled,
      onclick: () => controller.togglePicker(),
    },
    state.picking ? "Stop inspecting" : "Select element",
  )
}

function detailRow(key: string, value: Children): Vnode {
  return m("div.mi-row", [m("span.mi-key", key), m("span.mi-val", value)])
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

function inspectorPanel(controller: OverlayController, state: OverlayViewState): Vnode {
  const { selection } = state
  if (!selection || selection.node === null) {
    // Nothing selected yet — show the picker affordance and a hint.
    if (selection?.stale) {
      return m("div", [staleNotice(controller), m("p.mi-muted", "The captured source is retained below.")])
    }
    return m("div", [
      m("p.mi-muted", "No element selected."),
      m("p.mi-muted", "Press “Select element”, then hover and click an element in the page."),
    ])
  }

  const { mapping } = selection
  const componentName = state.selectedComponentName

  return m("div", [
    selection.stale ? staleNotice(controller) : null,
    m("div.mi-section-title", "Selected"),
    detailRow(
      "Component",
      componentName
        ? [componentName.name, componentName.inferred ? [" ", inferredNameBadge()] : null]
        : m("span.mi-muted", "—"),
    ),
    detailRow("Element", m("span.mi-mono", describeSelected(state))),
    detailRow("Source", mapping.fileLine ? m("span.mi-mono", mapping.fileLine) : m("span.mi-muted", "unknown")),
    detailRow("Mapping", [precisionBadge(mapping), m("span", { style: "margin-left:6px;" }, mapping.label)]),
    m("div.mi-actions", [
      m(
        "button.mi-btn.mi-btn-primary",
        {
          type: "button",
          disabled: mapping.fileLine === null,
          onclick: () => controller.openSelectedInEditor(),
        },
        "Open in editor",
      ),
      selection.componentId !== null
        ? revealButton(controller, selection.componentId, state.selectedComponentChoices)
        : null,
      m(
        "button.mi-btn",
        { type: "button", onclick: () => controller.clearSelection() },
        "Clear",
      ),
    ]),
    selection.componentId !== null
      ? revealChoiceGroup(controller, selection.componentId, state.selectedComponentChoices)
      : null,
    m("hr.mi-hr"),
    m("div.mi-section-title", "Component ancestry"),
    ancestrySection(controller, state),
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
    "button.mi-btn.mi-btn-small.mi-pin-btn",
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
    "📌",
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
      "button.mi-ancestry-name",
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
    m("ul.mi-ancestry.mi-pinned", state.componentTree.pinned.map((p) => pinnedRow(controller, p))),
  ]
}

function treeSearchInput(controller: OverlayController, state: OverlayViewState): Vnode {
  return m("input.mi-tree-search", {
    type: "search",
    placeholder: "Search components…",
    "aria-label": "Search components by name",
    value: state.componentTree.search,
    oninput: (event: Event) => controller.setTreeSearch((event.target as HTMLInputElement).value),
  })
}

/** Renders one entry's label + value for an object/map/array/set/typed-array container. */
function previewEntries(
  controller: OverlayController,
  target: "attrs" | "state",
  node: PreviewNode,
  overrides: ReadonlyMap<string, PreviewNode>,
): Children {
  switch (node.kind) {
    case "object":
      return node.entries.map((entry) =>
        m("li", { key: entry.key }, [
          m("span.mi-preview-key", `${entry.key}: `),
          previewNodeView(controller, target, entry.node, overrides),
        ]),
      )
    case "map":
      return node.entries.map((entry, i) =>
        m("li", { key: node.offset + i }, [
          previewNodeView(controller, target, entry.key, overrides),
          m("span.mi-preview-key", " => "),
          previewNodeView(controller, target, entry.value, overrides),
        ]),
      )
    case "array":
    case "typed-array":
      return node.items.map((item, i) =>
        m("li", { key: node.offset + i }, [
          m("span.mi-preview-key", `${node.offset + i}: `),
          previewNodeView(controller, target, item, overrides),
        ]),
      )
    case "set":
      return node.items.map((item, i) =>
        m("li", { key: node.offset + i }, previewNodeView(controller, target, item, overrides)),
      )
    default:
      return null
  }
}

type ContainerNode = Extract<PreviewNode, { kind: "object" | "array" | "map" | "set" | "typed-array" }>

function isContainerNode(node: PreviewNode): node is ContainerNode {
  switch (node.kind) {
    case "object":
    case "array":
    case "map":
    case "set":
    case "typed-array":
      return true
    default:
      return false
  }
}

/** How many entries/items a container has already fetched, for the "N more" pagination label. */
function shownCountOf(node: ContainerNode): number {
  if (node.kind === "object" || node.kind === "map") return node.entries.length
  return node.items.length
}

function totalCountOf(node: ContainerNode): number {
  if (node.kind === "object" || node.kind === "map" || node.kind === "set") return node.size
  return node.length
}

/** Recursively renders one preview node (§7.4), fetching getter/max-depth/pagination expansions on demand. */
function previewNodeView(
  controller: OverlayController,
  target: "attrs" | "state",
  node: PreviewNode,
  overrides: ReadonlyMap<string, PreviewNode>,
): Vnode {
  if (node.kind === "getter" || node.kind === "max-depth") {
    const resolved = overrides.get(pathKey(node.path))
    if (resolved !== undefined) return previewNodeView(controller, target, resolved, overrides)
    return m("span.mi-preview-getter", [
      m("span.mi-muted", summarizeNode(node)),
      m(
        "button.mi-btn.mi-btn-small",
        { type: "button", onclick: () => controller.expandComponentPreview(target, node.path) },
        node.kind === "getter" ? "Evaluate" : "Expand",
      ),
    ])
  }
  if (isContainerNode(node)) {
    const paged = node.truncated ? overrides.get(pathKey(node.path)) : undefined
    const effective = paged !== undefined && isContainerNode(paged) ? paged : node
    const shown = shownCountOf(effective)
    const remaining = totalCountOf(effective) - (effective.truncated ? effective.offset + shown : totalCountOf(effective))
    return m("div.mi-preview-node", [
      m("span.mi-preview-summary", summarizeNode(effective)),
      m("ul.mi-preview-entries", previewEntries(controller, target, effective, overrides)),
      effective.truncated
        ? m(
            "button.mi-btn.mi-btn-small",
            {
              type: "button",
              onclick: () => controller.expandComponentPreview(target, node.path, { offset: effective.offset + shown }),
            },
            `Show more (${remaining} more)`,
          )
        : null,
    ])
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

function previewSection(controller: OverlayController, state: OverlayViewState, target: "attrs" | "state"): Vnode {
  const { componentTree } = state
  const label = target === "attrs" ? "attrs" : "state"
  const gateMessage = previewGateMessage(componentTree.gating, label)
  if (gateMessage !== null) return m("p.mi-muted", gateMessage)
  const node = target === "attrs" ? componentTree.attrsPreview : componentTree.statePreview
  const overrides = target === "attrs" ? componentTree.attrsOverrides : componentTree.stateOverrides
  if (node === null) return m("p.mi-muted", `No ${label} available.`)
  return previewNodeView(controller, target, node, overrides)
}

/** The selected component's details: source actions, "scroll into view", and attrs/state previews (§9.3, §7.4). */
function selectedComponentPanel(controller: OverlayController, state: OverlayViewState): Children {
  const { componentId } = state.selection
  if (componentId === null) return null
  const self = state.ancestry[state.ancestry.length - 1]
  if (self === undefined) {
    // The instance was untracked between selection and this redraw (§8.8-style
    // tolerance — retain the fact that *something* was selected rather than
    // silently showing nothing).
    return [m("hr.mi-hr"), m("div.mi-section-title", "Selected component"), m("p.mi-muted", "Component is no longer tracked.")]
  }
  return [
    m("hr.mi-hr"),
    m("div.mi-section-title", "Selected component"),
    detailRow(
      "Component",
      [self.name.name, self.name.inferred ? [" ", inferredNameBadge()] : null, !self.mounted ? [" ", m("span.mi-muted", "(not mounted)")] : null],
    ),
    m("div.mi-actions", [
      revealButton(controller, componentId, self.choices),
      m(
        "button.mi-btn",
        { type: "button", onclick: () => controller.scrollComponentIntoView(componentId) },
        "Scroll into view",
      ),
    ]),
    revealChoiceGroup(controller, componentId, self.choices),
    state.componentTree.gating.enabled
      ? [
          m("div.mi-section-title", "Attrs"),
          previewSection(controller, state, "attrs"),
          m("div.mi-section-title", "State"),
          previewSection(controller, state, "state"),
        ]
      : null,
  ]
}

function componentsPanel(controller: OverlayController, state: OverlayViewState): Vnode {
  const { gating } = state.componentTree
  if (!gating.enabled) {
    return m("div", [
      m("p.mi-muted", "Component tree tracking is disabled."),
      m(
        "p.mi-muted",
        'Set componentTree.enabled (and mode: "components" or "full") in the Vite plugin options to see the full tree (§11.1).',
      ),
      m("p.mi-muted", "Use the Inspector tab to pick an element and open its source."),
    ])
  }
  return m("div", [
    treeSearchInput(controller, state),
    pinnedSection(controller, state),
    m("div.mi-section-title", "Component tree"),
    treeList(controller, state),
    selectedComponentPanel(controller, state),
  ])
}

function shortcutRow(label: string, value: string): Vnode {
  const shown = value.trim() === "" ? "(disabled)" : value
  return m("div.mi-row", [m("span.mi-key", label), m("span.mi-val.mi-mono", shown)])
}

function settingsPanel(controller: OverlayController, state: OverlayViewState): Vnode {
  const { picker } = controller.options
  return m("div", [
    m("div.mi-section-title", "Shortcuts"),
    m("p.mi-muted", "Configured via the plugin options; each can be changed or disabled."),
    shortcutRow("Toggle", picker.toggleShortcut),
    shortcutRow("Hold", picker.holdShortcut),
    shortcutRow("Open", picker.openShortcut),
    shortcutRow("Cancel", picker.cancelShortcut),
    shortcutRow("Pass-through", picker.passThroughModifier),
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

function panelTab(controller: OverlayController, current: OverlayTab, tab: OverlayTab, label: string): Vnode {
  return m(
    "button.mi-tabbtn",
    {
      type: "button",
      role: "tab",
      id: `mi-tab-${tab}`,
      "aria-selected": current === tab ? "true" : "false",
      "aria-controls": "mi-panel-body",
      onclick: () => controller.setActiveTab(tab),
    },
    label,
  )
}

function panel(controller: OverlayController, state: OverlayViewState): Vnode {
  const body =
    state.activeTab === "components"
      ? componentsPanel(controller, state)
      : state.activeTab === "settings"
        ? settingsPanel(controller, state)
        : inspectorPanel(controller, state)

  return m(
    "section.mi-panel",
    { role: "dialog", "aria-label": "Mithril Inspector", style: offsetStyle(state) },
    [
      m("header.mi-panel-header", [
        m(
          "span.mi-panel-title",
          { onpointerdown: (event: DragPointerEvent) => beginDrag(event, controller) },
          [m("span.mi-diamond", { "aria-hidden": "true" }, "◇ "), "Mithril Inspect"],
        ),
        pickerButton(controller, state),
        m(
          "button.mi-btn",
          {
            type: "button",
            "aria-label": "Collapse Mithril Inspector",
            onclick: () => controller.setCollapsed(true),
          },
          "–",
        ),
      ]),
      m("div.mi-tablist", { role: "tablist", "aria-label": "Inspector sections" }, [
        panelTab(controller, state.activeTab, "inspector", "Inspector"),
        panelTab(controller, state.activeTab, "components", "Components"),
        panelTab(controller, state.activeTab, "settings", "Settings"),
      ]),
      m("div.mi-panel-body", { id: "mi-panel-body", role: "tabpanel" }, body),
    ],
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
        class: `mi-root mi-pos-${controller.options.position}`,
        style: `--mi-z:${controller.options.zIndex};`,
      }
      if (themeAttr !== undefined) rootAttrs["data-theme"] = themeAttr

      return m("div", rootAttrs, [
        highlightLayer(state),
        hoverBadge(state),
        pickingBanner(state),
        state.collapsed ? collapsedTab(controller, state) : panel(controller, state),
      ])
    },
  }
}
