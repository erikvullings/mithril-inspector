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
      // Toggling while picking always makes it sticky-off, whether the current
      // session was a hold or a toggle. (A hold that was toggled would be odd;
      // the simplest, least-surprising rule is: toggle key ends picking.)
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
