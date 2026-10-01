// M2 · Calculation — the operator controls it (client decision, 2026-09-21): nothing calculates until Run is clicked,
// the first time and again after every change of the inputs (or of the calculation precision).
export type CalcStatus = "IDLE" | "INCOMPLETE" | "CALCULATING" | "READY" | "STALE" | "INVALID" | "UNAVAILABLE";

export interface CalcState {
  status: CalcStatus;
  seq: number;
  errorMessage: string | null;
}

export type CalcEvent =
  | { type: "runClicked"; complete: boolean }
  | { type: "formChanged" }
  | { type: "formCleared" }
  | { type: "calcSucceeded"; seq: number }
  | { type: "calc422"; seq: number; detail: string }
  | { type: "calcFailed"; seq: number };

export const UNAVAILABLE_MESSAGE = "The calculation service is temporarily unavailable.";

export const initialCalcState: CalcState = { status: "IDLE", seq: 0, errorMessage: null };

const illegal = (state: CalcState, event: CalcEvent): never => {
  throw new Error(`calcReducer: illegal event ${event.type} in state ${state.status}`);
};

export function calcReducer(state: CalcState, event: CalcEvent): CalcState {
  switch (event.type) {
    case "calcSucceeded":
    case "calc422":
    case "calcFailed": {
      if (event.seq !== state.seq) return state; // C-11: a response from before the last Run / edit, ignored in every state
      if (state.status !== "CALCULATING") return illegal(state, event); // C-14
      if (event.type === "calcSucceeded") return { ...state, status: "READY", errorMessage: null }; // C-10
      if (event.type === "calc422") return { ...state, status: "INVALID", errorMessage: event.detail }; // C-12
      return { ...state, status: "UNAVAILABLE", errorMessage: UNAVAILABLE_MESSAGE }; // C-13
    }

    case "runClicked":
      if (state.status === "CALCULATING") return state; // C-05: a duplicate click
      return { status: event.complete ? "CALCULATING" : "INCOMPLETE", seq: state.seq + 1, errorMessage: null }; // C-01…C-04

    case "formCleared": // C-15: New quote — a blank form has no result; the seq moves on so a late response is stale (C-11)
      return { status: "IDLE", seq: state.seq + 1, errorMessage: null };

    case "formChanged":
      switch (state.status) {
        case "IDLE":
        case "INCOMPLETE":
        case "STALE":
          return state; // C-06, C-08: nothing to go stale / already stale
        case "READY":
        case "INVALID":
        case "UNAVAILABLE":
          return { ...state, status: "STALE", errorMessage: null }; // C-07: the shown result no longer matches the inputs
        case "CALCULATING":
          return { status: "STALE", seq: state.seq + 1, errorMessage: null }; // C-09: the in-flight response is now stale
      }
      return illegal(state, event);

    default:
      return illegal(state, event as CalcEvent);
  }
}
