import { describe, expect, it } from "vitest"

import {
  createPickerMachine,
  initialPickerState,
  isPicking,
  pickerReducer,
  type PickerAction,
  type PickerState,
} from "./picker.js"

/** Replay a sequence of actions from the initial state. */
function run(actions: PickerAction[], from: PickerState = initialPickerState()): PickerState {
  return actions.reduce(pickerReducer, from)
}

const el = (id: string): Element => {
  const node = document.createElement("div")
  node.id = id
  return node
}

describe("pickerReducer — single transitions", () => {
  it("starts idle", () => {
    expect(initialPickerState()).toEqual({ phase: "idle", activation: null, hovered: null })
  })

  it("toggles idle → picking(toggle) → idle", () => {
    const active = pickerReducer(initialPickerState(), { type: "toggle" })
    expect(active).toEqual({ phase: "picking", activation: "toggle", hovered: null })
    expect(pickerReducer(active, { type: "toggle" })).toEqual(initialPickerState())
  })

  it("hold-start enters picking(hold); hold-end exits", () => {
    const held = pickerReducer(initialPickerState(), { type: "hold-start" })
    expect(held.activation).toBe("hold")
    expect(pickerReducer(held, { type: "hold-end" })).toEqual(initialPickerState())
  })

  it("ignores hover while idle and tracks it while picking", () => {
    const target = el("a")
    expect(pickerReducer(initialPickerState(), { type: "hover", target }).hovered).toBeNull()
    const active = run([{ type: "toggle" }, { type: "hover", target }])
    expect(active.hovered).toBe(target)
  })

  it("cancel always returns to idle and clears hover", () => {
    const active = run([{ type: "hold-start" }, { type: "hover", target: el("a") }])
    expect(pickerReducer(active, { type: "cancel" })).toEqual(initialPickerState())
  })

  it("select in non-continuous mode exits; continuous stays picking", () => {
    const active = run([{ type: "toggle" }, { type: "hover", target: el("a") }])
    expect(pickerReducer(active, { type: "select", continuous: false })).toEqual(initialPickerState())
    const stillPicking = pickerReducer(active, { type: "select", continuous: true })
    expect(isPicking(stillPicking)).toBe(true)
    expect(stillPicking.activation).toBe("toggle")
  })
})

describe("pickerReducer — interleaved multi-step sequences", () => {
  it("a hold-end does NOT cancel a session that was promoted to a toggle", () => {
    // hold Alt+Shift, then press the toggle chord (sticky), then release Alt+Shift.
    // The toggle key turns picking OFF, so pressing it while holding ends the
    // session; a subsequent hold-end must not resurrect or corrupt state.
    const afterToggleWhileHolding = run([{ type: "hold-start" }, { type: "toggle" }])
    expect(afterToggleWhileHolding).toEqual(initialPickerState())
    expect(pickerReducer(afterToggleWhileHolding, { type: "hold-end" })).toEqual(initialPickerState())
  })

  it("hold-end while toggled-active leaves the sticky session intact", () => {
    // Enter via toggle (sticky), then a stray modifier release arrives.
    const state = run([
      { type: "toggle" },
      { type: "hover", target: el("a") },
      { type: "hold-end" },
    ])
    expect(isPicking(state)).toBe(true)
    expect(state.activation).toBe("toggle")
    expect((state.hovered as Element).id).toBe("a")
  })

  it("continuous selection keeps picking across several hover/select cycles", () => {
    const a = el("a")
    const b = el("b")
    const state = run([
      { type: "toggle" },
      { type: "hover", target: a },
      { type: "select", continuous: true },
      { type: "hover", target: b },
      { type: "select", continuous: true },
    ])
    expect(isPicking(state)).toBe(true)
    expect(state.hovered).toBe(b)
  })

  it("hold session survives interleaved hovers then ends only on release", () => {
    const state = run([
      { type: "hold-start" },
      { type: "hover", target: el("a") },
      { type: "hover", target: el("b") },
    ])
    expect(state.activation).toBe("hold")
    const ended = pickerReducer(state, { type: "hold-end" })
    expect(ended).toEqual(initialPickerState())
  })

  it("hold-start is idempotent while already picking (no downgrade of activation)", () => {
    const state = run([{ type: "toggle" }, { type: "hold-start" }])
    expect(state.activation).toBe("toggle")
  })
})

describe("createPickerMachine", () => {
  it("notifies on change only and reports picking", () => {
    const changes: PickerState[] = []
    const machine = createPickerMachine((next) => changes.push(next))
    machine.dispatch({ type: "hover", target: el("a") }) // idle → ignored, no change
    expect(changes).toHaveLength(0)
    machine.dispatch({ type: "toggle" })
    expect(machine.isPicking()).toBe(true)
    machine.dispatch({ type: "toggle" })
    expect(machine.isPicking()).toBe(false)
    expect(changes).toHaveLength(2)
  })
})
