import m from "mithril"
import type { Vnode } from "mithril"

/**
 * Small inline-SVG icon set for the panel's action buttons (§8.3). Hand-built
 * from primitive shapes (circle/line/rect/polyline) plus straight-segment
 * paths only — no curve commands — so every glyph is exactly as specified,
 * with nothing pulled from an external icon font/CDN (§8.2 self-contained
 * shadow root). Each icon is a plain 16x16 `currentColor` line-art glyph;
 * callers wrap it in a `title`-bearing button so the name shows as a tooltip.
 */

interface IconOptions {
  readonly size?: number
}

function icon(children: Vnode | Vnode[], options: IconOptions = {}): Vnode {
  const size = options.size ?? 16
  return m(
    "svg",
    {
      viewBox: "0 0 24 24",
      width: size,
      height: size,
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 1.8,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
    },
    children,
  )
}

/** Picker activation (§8.4) — a crosshair/target, distinct from the collapsed toggle's "M" mark. */
export function iconTarget(): Vnode {
  return icon([
    m("circle", { cx: 12, cy: 12, r: 7 }),
    m("circle", { cx: 12, cy: 12, r: 2.5 }),
    m("line", { x1: 12, y1: 1, x2: 12, y2: 4 }),
    m("line", { x1: 12, y1: 20, x2: 12, y2: 23 }),
    m("line", { x1: 1, y1: 12, x2: 4, y2: 12 }),
    m("line", { x1: 20, y1: 12, x2: 23, y2: 12 }),
  ])
}

/** Settings sidebar entry — an equalizer/sliders glyph. */
export function iconSettings(options?: IconOptions): Vnode {
  return icon(
    [
      m("line", { x1: 4, y1: 6, x2: 20, y2: 6 }),
      m("circle", { cx: 9, cy: 6, r: 2 }),
      m("line", { x1: 4, y1: 12, x2: 20, y2: 12 }),
      m("circle", { cx: 16, cy: 12, r: 2 }),
      m("line", { x1: 4, y1: 18, x2: 20, y2: 18 }),
      m("circle", { cx: 8, cy: 18, r: 2 }),
    ],
    options,
  )
}

/** "Open in editor" — a `</>` code glyph. */
export function iconCode(): Vnode {
  return icon([
    m("polyline", { points: "9,6 3,12 9,18" }),
    m("polyline", { points: "15,6 21,12 15,18" }),
  ])
}

/** "Open component view" — an eye glyph. */
export function iconEye(): Vnode {
  return icon([
    m("path", { d: "M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" }),
    m("circle", { cx: 12, cy: 12, r: 3 }),
  ])
}

/** "Open component declaration" — a document glyph. */
export function iconFileText(): Vnode {
  return icon([
    m("path", { d: "M6 2h9l5 5v15H6Z" }),
    m("path", { d: "M15 2v6h6" }),
    m("line", { x1: 9, y1: 13, x2: 15, y2: 13 }),
    m("line", { x1: 9, y1: 17, x2: 15, y2: 17 }),
  ])
}

/** Pin a component (§3.2) — a map-pin glyph, replacing the former emoji for a consistent icon language. */
export function iconPin(): Vnode {
  return icon([
    m("path", { d: "M12 22s7-7.58 7-12a7 7 0 1 0-14 0c0 4.42 7 12 7 12Z" }),
    m("circle", { cx: 12, cy: 10, r: 2.5 }),
  ])
}

/** Unpin an already-pinned component — the same map-pin glyph struck through, distinct at a glance from `iconPin`. */
export function iconPinOff(): Vnode {
  return icon([
    m("path", { d: "M12 22s7-7.58 7-12a7 7 0 1 0-14 0c0 4.42 7 12 7 12Z" }),
    m("circle", { cx: 12, cy: 10, r: 2.5 }),
    m("line", { x1: 4, y1: 20, x2: 20, y2: 4 }),
  ])
}

/** "Scroll into view" — a viewfinder/focus-frame glyph. */
export function iconFocus(): Vnode {
  return icon([
    m("polyline", { points: "8,4 4,4 4,8" }),
    m("polyline", { points: "16,4 20,4 20,8" }),
    m("polyline", { points: "8,20 4,20 4,16" }),
    m("polyline", { points: "16,20 20,20 20,16" }),
    m("circle", { cx: 12, cy: 12, r: 3 }),
  ])
}

/** Component search input decoration — a magnifying glass. */
export function iconSearch(): Vnode {
  return icon([m("circle", { cx: 11, cy: 11, r: 7 }), m("line", { x1: 21, y1: 21, x2: 16.65, y2: 16.65 })])
}

/** Clear selection / close — an X glyph. */
export function iconClose(): Vnode {
  return icon([
    m("line", { x1: 5, y1: 5, x2: 19, y2: 19 }),
    m("line", { x1: 19, y1: 5, x2: 5, y2: 19 }),
  ])
}

/** The "Components" sidebar entry — a small branching-tree glyph. */
export function iconComponents(options?: IconOptions): Vnode {
  return icon(
    [
      m("circle", { cx: 6, cy: 6, r: 2 }),
      m("circle", { cx: 6, cy: 18, r: 2 }),
      m("circle", { cx: 18, cy: 12, r: 2 }),
      m("path", { d: "M6 8V16" }),
      m("path", { d: "M6 12H12V9" }),
    ],
    options,
  )
}

/** The "History" sidebar entry (task 0027, renamed from "State History" once it also covers attrs — task 0027 follow-up) — a clock face, distinct from Settings' equalizer glyph. */
export function iconHistory(options?: IconOptions): Vnode {
  return icon([m("circle", { cx: 12, cy: 12, r: 9 }), m("polyline", { points: "12,7 12,12 16,14" })], options)
}
