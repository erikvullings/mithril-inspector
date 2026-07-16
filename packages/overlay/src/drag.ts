import type { OverlayController } from "./controller.js"

/**
 * Pointer-drag support for moving the overlay (§8.1 "movable when it conflicts
 * with application UI"). The drag offset is applied on top of the configured
 * corner and persisted by the controller. Kept separate from the view so it can
 * be unit-tested by injecting a fake window.
 */

export interface DragPointerEvent {
  readonly clientX: number
  readonly clientY: number
  /** The AbstractView (window) the event belongs to. */
  readonly view?: WindowLike | null
  readonly currentTarget?: EventTarget | null
  preventDefault?(): void
}

export interface WindowLike {
  addEventListener(type: string, listener: (event: DragPointerEvent) => void): void
  removeEventListener(type: string, listener: (event: DragPointerEvent) => void): void
}

export type DragController = Pick<OverlayController, "getState" | "setOffset">

const MOVE_THRESHOLD_PX = 3

/**
 * Begin a drag from a pointerdown. Tracks subsequent moves on `event.view` and
 * updates the controller offset relative to where the drag started. If the
 * pointer actually moved, a one-shot capturing click suppressor is installed on
 * the drag handle so a drag does not also fire the handle's click (e.g.
 * expanding the tab).
 */
export function beginDrag(event: DragPointerEvent, controller: DragController): void {
  const win = event.view ?? (globalThis as unknown as WindowLike)
  if (typeof win.addEventListener !== "function") return

  const startX = event.clientX
  const startY = event.clientY
  const base = controller.getState().offset ?? { x: 0, y: 0 }
  const handle = (event.currentTarget ?? null) as (EventTarget & { addEventListener?: unknown }) | null
  let moved = false

  const onMove = (moveEvent: DragPointerEvent): void => {
    const dx = moveEvent.clientX - startX
    const dy = moveEvent.clientY - startY
    if (!moved && Math.abs(dx) + Math.abs(dy) > MOVE_THRESHOLD_PX) moved = true
    controller.setOffset({ x: base.x + dx, y: base.y + dy })
  }

  const onUp = (): void => {
    win.removeEventListener("pointermove", onMove)
    win.removeEventListener("pointerup", onUp)
    if (moved && handle !== null && typeof (handle as { addEventListener?: unknown }).addEventListener === "function") {
      const suppress = (clickEvent: Event): void => {
        clickEvent.stopPropagation()
        clickEvent.preventDefault()
        ;(handle as EventTarget).removeEventListener("click", suppress, true)
      }
      ;(handle as EventTarget).addEventListener("click", suppress, true)
    }
  }

  win.addEventListener("pointermove", onMove)
  win.addEventListener("pointerup", onUp)
}
