import type { ComponentId } from "@mithril-inspector/protocol"
import m from "mithril"
import type { Children, Component, Vnode } from "mithril"

import type { AncestryEntry, OverlayController, OverlayTab, OverlayViewState, SourceChoice } from "./controller.js"
import { beginDrag, type DragPointerEvent } from "./drag.js"
import type { HighlightRect } from "./highlight.js"
import type { MappingInfo, MappingPrecision } from "./mapping.js"
import type { OverlayTheme } from "./options.js"

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

function componentsPanel(): Vnode {
  return m("div", [
    m("p.mi-muted", "The component tree arrives in a later phase."),
    m("p.mi-muted", "Use the Inspector tab to pick an element and open its source."),
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
      ? componentsPanel()
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
