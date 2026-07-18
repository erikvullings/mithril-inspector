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

  // `m.mount` registers its root in Mithril's own shared, module-level
  // subscription list, and `m.redraw()` redraws *every* registered root —
  // there is no scoped "redraw just this mount" API. Since the overlay and
  // the host app resolve to the same `mithril` module, calling `m.redraw()`
  // from here would redraw the app too — which, worse, is observable by our
  // own instrumentation (every component's `onupdate`/`updateCount` fires
  // again), producing a fresh batch of `RuntimeEvent`s that the Components
  // tab's subscription (task 0022) reacts to by redrawing again: an
  // unbounded, self-sustaining loop needing no user interaction at all.
  // `m.render(dom, vnode)` called directly (not through `m.mount`) is scoped
  // to exactly the element passed in and never touches that shared registry,
  // so the overlay can redraw itself without ever cascading into the app.
  // Every state-mutating controller method already calls `redraw()`
  // explicitly at its end (never relies on Mithril's implicit
  // redraw-after-event), so swapping the mechanism here is enough.
  let renderOverlay: () => void = () => {}
  const controller = createOverlayController({
    hook,
    options: resolved,
    doc,
    redraw: () => renderOverlay(),
    storage: win?.localStorage ?? null,
  })
  controller.setHost(host)

  const overlayComponent = OverlayRoot(controller)
  renderOverlay = () => {
    m.render(mountPoint, m(overlayComponent))
  }
  renderOverlay()

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

  // --- Stale-highlight cleanup on SPA navigation --------------------------
  // The frozen selection rectangle is only recomputed on scroll/resize
  // (above) or an explicit controller action — an in-app route change (e.g.
  // `m.route.set()`) swaps DOM without firing either, so a previously
  // selected element's highlight box would otherwise keep floating over
  // content that no longer exists. A DOM mutation is the one signal common
  // to every routing approach (Mithril's own router included), so watching
  // the document body's subtree and re-running the same rAF-throttled
  // `refreshHighlight()` (which already checks `node.isConnected`) clears or
  // repositions the box the next time anything meaningful changes. This
  // never observes inside the overlay's own shadow root (shadow boundaries
  // are opaque to a light-DOM `MutationObserver`), so it cannot loop back on
  // the overlay's own re-renders.
  const MutationObserverImplForDom = (globalThis as unknown as { MutationObserver?: typeof MutationObserver })
    .MutationObserver
  const domObserver = MutationObserverImplForDom ? new MutationObserverImplForDom(onScrollOrResize) : null
  domObserver?.observe(doc.body, { childList: true, subtree: true })

  // --- Modal <dialog> detection (known Phase-1 limitation, §8.2) ---------
  // `showModal()` promotes a <dialog> into the browser's top layer, which
  // paints above the shadow-root host regardless of z-index and makes the
  // rest of the document inert — pointer and keyboard events aimed at the
  // overlay never arrive while one is open, so there is nothing the overlay
  // itself can intercept to react on click/keydown. `:modal` is the one
  // reliable, spec-defined signal, so it's polled passively via a
  // MutationObserver on the `open` attribute instead.
  const MutationObserverImpl = (globalThis as unknown as { MutationObserver?: typeof MutationObserver })
    .MutationObserver
  let modalOpen = false
  const checkModalState = (): void => {
    const isModal = doc.querySelector(":modal") !== null
    if (isModal === modalOpen) return
    modalOpen = isModal
    if (isModal) {
      controller.diagnostics.record(
        "modal-dialog",
        new Error(
          "A native <dialog> is open in modal state (showModal()). The browser's top-layer/inert " +
            "semantics block pointer and keyboard events from reaching the inspector until it closes " +
            "— known Phase-1 limitation, not a bug.",
        ),
      )
    }
  }
  const modalObserver = MutationObserverImpl ? new MutationObserverImpl(checkModalState) : null
  modalObserver?.observe(doc.documentElement, { subtree: true, attributes: true, attributeFilter: ["open"] })

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
      domObserver?.disconnect()
      modalObserver?.disconnect()
      controller.dispose()
      m.render(mountPoint, [])
      host.remove()
    },
  }
}
