import m from "mithril"

import { createOverlayController, type OverlayController } from "./controller.js"
import { createFrameScheduler } from "./highlight.js"
import { getOverlayHook, type OverlayHook } from "./hook.js"
import { resolveOverlayOptions, type OverlayOptionsInput } from "./options.js"
import { overlayCss } from "./styles.js"
import { OverlayRoot } from "./view.js"

/** The shadow-root host element id (§8.2). */
export const HOST_ID = "__mithril-inspector-host"

export interface OverlayMountDeps {
  /** Runtime hook; defaults to reading `window.__MITHRIL_INSPECTOR__`. */
  readonly hook?: OverlayHook | null
  readonly document?: Document
  readonly window?: Window
}

export interface OverlayHandle {
  readonly controller: OverlayController
  readonly host: HTMLElement
  readonly shadowRoot: ShadowRoot
  /** Tear down listeners, unmount Mithril, and remove the host (idempotent). */
  dispose(): void
}

interface CoordEvent {
  clientX: number
  clientY: number
}

/**
 * Mount the inspector overlay into an isolated shadow root on `document.body`
 * (§8.1, §8.2). Returns a handle, or `null` when disabled or the DOM is
 * unavailable. Pointer, scroll and resize work is coalesced to one update per
 * animation frame (§8.6, §17), and every listener is registered in the capture
 * phase so the picker can intercept before application handlers (§8.5).
 */
export function mountInspectorOverlay(
  options: OverlayOptionsInput = {},
  deps: OverlayMountDeps = {},
): OverlayHandle | null {
  const resolved = resolveOverlayOptions(options)
  if (!resolved.enabled) return null

  const doc = deps.document ?? (globalThis as { document?: Document }).document
  if (doc?.body === undefined || doc.body === null) return null
  const win = deps.window ?? doc.defaultView ?? (globalThis as { window?: Window }).window ?? undefined
  const hook = deps.hook !== undefined ? deps.hook : getOverlayHook((win ?? globalThis) as { __MITHRIL_INSPECTOR__?: unknown })

  // Remove any prior host (e.g. an HMR remount) to avoid duplicates.
  doc.getElementById(HOST_ID)?.remove()

  const host = doc.createElement("div")
  host.id = HOST_ID
  const shadowRoot = host.attachShadow({ mode: resolved.closedShadowRoot ? "closed" : "open" })

  const style = doc.createElement("style")
  style.textContent = overlayCss()
  shadowRoot.appendChild(style)

  const mountPoint = doc.createElement("div")
  shadowRoot.appendChild(mountPoint)
  doc.body.appendChild(host)

  // Keep the host out of runtime tracking and element picking (§8.2).
  hook?.excludeHost(host)

  const controller = createOverlayController({
    hook,
    options: resolved,
    doc,
    redraw: () => m.redraw(),
    storage: win?.localStorage ?? null,
  })
  controller.setHost(host)

  m.mount(mountPoint, OverlayRoot(controller))

  // --- Listener wiring (capture phase, rAF-throttled) --------------------
  let lastX = 0
  let lastY = 0
  const moveScheduler = createFrameScheduler(() => controller.handlePointerMove(lastX, lastY))
  const refreshScheduler = createFrameScheduler(() => controller.refreshHighlight())

  const onPointerMove = (event: Event): void => {
    if (!controller.isPicking()) return
    const coord = event as unknown as CoordEvent
    lastX = coord.clientX
    lastY = coord.clientY
    moveScheduler.request()
  }
  const onClick = (event: Event): void => {
    const handled = controller.handleClick(event as unknown as MouseEvent)
    if (handled) event.stopImmediatePropagation()
  }
  const onKeyDown = (event: Event): void => {
    controller.handleKeyDown(event as KeyboardEvent)
  }
  const onKeyUp = (event: Event): void => {
    controller.handleKeyUp(event as KeyboardEvent)
  }
  const onScrollOrResize = (): void => {
    refreshScheduler.request()
  }

  doc.addEventListener("pointermove", onPointerMove, true)
  doc.addEventListener("click", onClick, true)
  doc.addEventListener("keydown", onKeyDown, true)
  doc.addEventListener("keyup", onKeyUp, true)
  doc.addEventListener("scroll", onScrollOrResize, true)
  win?.addEventListener("resize", onScrollOrResize)

  let disposed = false
  return {
    controller,
    host,
    shadowRoot,
    dispose() {
      if (disposed) return
      disposed = true
      moveScheduler.cancel()
      refreshScheduler.cancel()
      doc.removeEventListener("pointermove", onPointerMove, true)
      doc.removeEventListener("click", onClick, true)
      doc.removeEventListener("keydown", onKeyDown, true)
      doc.removeEventListener("keyup", onKeyUp, true)
      doc.removeEventListener("scroll", onScrollOrResize, true)
      win?.removeEventListener("resize", onScrollOrResize)
      m.mount(mountPoint, null)
      host.remove()
    },
  }
}
