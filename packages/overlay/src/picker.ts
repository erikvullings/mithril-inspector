/**
 * The element-picker state machine (§8.4–8.7). Kept a pure reducer so its
 * transitions — toggle vs. momentary hold, hover updates, selection, cancel —
 * can be tested in isolation from the DOM and the Mithril view.
 *
 * There are two ways to enter picking:
 *   - a sticky *toggle* (e.g. `Alt+Shift+M`), which stays active until toggled
 *     off, cancelled, or a non-continuous selection is made;
 *   - a momentary *hold* (e.g. holding `Alt+Shift`), active only while held.
 * The `activation` field records which, so a hold release only ends a
 * hold-initiated session and never a toggled one.
 */

export type PickerPhase = "idle" | "picking"
export type PickerActivation = "toggle" | "hold" | null

export interface PickerState {
  readonly phase: PickerPhase
  readonly activation: PickerActivation
  /** The element currently under the pointer while picking (transient). */
  readonly hovered: Element | null
}

export type PickerAction =
  | { type: "toggle" }
  | { type: "hold-start" }
  | { type: "hold-end" }
  | { type: "hover"; target: Element | null }
  | { type: "select"; continuous: boolean }
  | { type: "cancel" }

export function initialPickerState(): PickerState {
  return { phase: "idle", activation: null, hovered: null }
}

export function isPicking(state: PickerState): boolean {
  return state.phase === "picking"
}

const IDLE: PickerState = { phase: "idle", activation: null, hovered: null }

export function pickerReducer(state: PickerState, action: PickerAction): PickerState {
  switch (action.type) {
    case "toggle": {
      if (state.phase === "idle") return { phase: "picking", activation: "toggle", hovered: null }
      // A toggle shortcut whose modifiers are a superset of the hold
      // shortcut's (e.g. hold "Alt", toggle "Alt+Shift+M") makes pressing the
      // *hold*'s modifiers on the way to the full chord start a hold session
      // before the chord's own key is even pressed — one continuous physical
      // gesture, not two independent requests. Promoting it to a toggle
      // (rather than treating "toggle" as "cancel the hold that same
      // keypress incidentally started") is what makes the chord actually
      // able to turn picking on and keep it on; see `hold-end` below.
      if (state.activation === "hold") return { ...state, activation: "toggle" }
      // Toggling an already-sticky (toggle-activated) session turns it off.
      return IDLE
    }

    case "hold-start": {
      if (state.phase === "picking") return state
      return { phase: "picking", activation: "hold", hovered: null }
    }

    case "hold-end": {
      // Releasing the hold only ends a hold-initiated session; a toggled session
      // (including one promoted from a hold) persists.
      if (state.phase === "picking" && state.activation === "hold") return IDLE
      return state
    }

    case "hover": {
      if (state.phase !== "picking") return state
      if (state.hovered === action.target) return state
      return { ...state, hovered: action.target }
    }

    case "select": {
      if (state.phase !== "picking") return state
      // Selection freezes the highlight and shows details; picking continues
      // only in continuous mode (§8.7).
      if (action.continuous) return state
      return IDLE
    }

    case "cancel": {
      if (state.phase === "idle") return state
      return IDLE
    }

    default: {
      const exhaustive: never = action
      return exhaustive
    }
  }
}

/** A small stateful wrapper over {@link pickerReducer} for the controller. */
export interface PickerMachine {
  getState(): PickerState
  dispatch(action: PickerAction): PickerState
  /** `true` when the dispatch changed the state (caller can skip redraws). */
  isPicking(): boolean
}

export function createPickerMachine(
  onChange?: (state: PickerState, previous: PickerState) => void,
): PickerMachine {
  let state = initialPickerState()
  return {
    getState: () => state,
    isPicking: () => isPicking(state),
    dispatch(action) {
      const previous = state
      const next = pickerReducer(state, action)
      if (next !== previous) {
        state = next
        onChange?.(next, previous)
      }
      return state
    },
  }
}
