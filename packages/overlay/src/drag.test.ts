import { describe, expect, it, vi } from "vitest"

import { beginDrag, type DragController, type DragPointerEvent, type WindowLike } from "./drag.js"

function fakeWindow(): WindowLike & { fire(type: string, event: DragPointerEvent): void } {
  const listeners = new Map<string, (event: DragPointerEvent) => void>()
  return {
    addEventListener(type, listener) {
      listeners.set(type, listener)
    },
    removeEventListener(type) {
      listeners.delete(type)
    },
    fire(type, event) {
      listeners.get(type)?.(event)
    },
  }
}

function fakeController(offset: { x: number; y: number } | null = null): DragController & { offset: { x: number; y: number } | null } {
  const state = { offset }
  return {
    offset,
    getState: () => ({ offset: state.offset }) as ReturnType<OverlayControllerGetState>,
    setOffset: vi.fn((next: { x: number; y: number } | null) => {
      state.offset = next
    }),
  }
}
type OverlayControllerGetState = DragController["getState"]

describe("beginDrag", () => {
  it("moves the offset by the pointer delta relative to the drag start", () => {
    const win = fakeWindow()
    const controller = fakeController({ x: 10, y: 20 })
    beginDrag({ clientX: 100, clientY: 100, view: win }, controller)

    win.fire("pointermove", { clientX: 130, clientY: 90, view: win })
    expect(controller.setOffset).toHaveBeenCalledWith({ x: 40, y: 10 }) // base + (30, -10)

    win.fire("pointerup", { clientX: 130, clientY: 90, view: win })
    // Listeners are removed on pointerup: a later move is ignored.
    controller.setOffset = vi.fn()
    win.fire("pointermove", { clientX: 200, clientY: 200, view: win })
    expect(controller.setOffset).not.toHaveBeenCalled()
  })

  it("starts from {0,0} when no offset is set yet", () => {
    const win = fakeWindow()
    const controller = fakeController(null)
    beginDrag({ clientX: 0, clientY: 0, view: win }, controller)
    win.fire("pointermove", { clientX: 15, clientY: 25, view: win })
    expect(controller.setOffset).toHaveBeenCalledWith({ x: 15, y: 25 })
  })

  it("installs a one-shot click suppressor only after real movement", () => {
    const win = fakeWindow()
    const controller = fakeController(null)
    const handle = { addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as EventTarget

    beginDrag({ clientX: 0, clientY: 0, view: win, currentTarget: handle }, controller)
    // Move well beyond the threshold, then release.
    win.fire("pointermove", { clientX: 20, clientY: 0, view: win })
    win.fire("pointerup", { clientX: 20, clientY: 0, view: win })
    expect((handle as unknown as { addEventListener: ReturnType<typeof vi.fn> }).addEventListener).toHaveBeenCalledWith(
      "click",
      expect.any(Function),
      true,
    )
  })

  it("does not suppress the click when the pointer barely moved (a click, not a drag)", () => {
    const win = fakeWindow()
    const controller = fakeController(null)
    const handle = { addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as EventTarget

    beginDrag({ clientX: 0, clientY: 0, view: win, currentTarget: handle }, controller)
    win.fire("pointermove", { clientX: 1, clientY: 1, view: win }) // within threshold
    win.fire("pointerup", { clientX: 1, clientY: 1, view: win })
    expect((handle as unknown as { addEventListener: ReturnType<typeof vi.fn> }).addEventListener).not.toHaveBeenCalled()
  })
})
