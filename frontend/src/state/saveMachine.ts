export type SaveStatus = "IDLE" | "SAVING" | "SAVED" | "FAILED_SOFT" | "INVALID";
export type SaveKind = "quote" | "draft";

export interface SaveState {
  quote: SaveStatus;
  draft: SaveStatus;
  quoteError: string | null;
  quoteSubmittedVersion: number | null;
  draftSubmittedVersion: number | null;
}

export type SaveEvent =
  | { type: "saveClicked"; kind: SaveKind; version: number }
  | { type: "saveSucceeded"; kind: SaveKind; version: number }
  | { type: "saveSoftFailed"; kind: SaveKind }
  | { type: "saveNetworkError"; kind: SaveKind }
  | { type: "save422"; kind: SaveKind; detail: string }
  | { type: "toastDismissed"; kind: SaveKind }
  | { type: "formChanged" };

export const initialSaveState: SaveState = {
  quote: "IDLE",
  draft: "IDLE",
  quoteError: null,
  quoteSubmittedVersion: null,
  draftSubmittedVersion: null,
};

const illegal = (state: SaveState, event: SaveEvent): never => {
  throw new Error(`saveReducer: illegal event ${event.type} in state ${JSON.stringify(state)}`);
};

const FINISHED: SaveStatus[] = ["SAVED", "FAILED_SOFT", "INVALID"];

function resetInstance(state: SaveState, kind: SaveKind): SaveState {
  return kind === "quote"
    ? { ...state, quote: "IDLE", quoteError: null, quoteSubmittedVersion: null }
    : { ...state, draft: "IDLE", draftSubmittedVersion: null };
}

function withStatus(state: SaveState, kind: SaveKind, status: SaveStatus): SaveState {
  return kind === "quote" ? { ...state, quote: status } : { ...state, draft: status };
}

export function saveReducer(state: SaveState, event: SaveEvent): SaveState {
  if (event.type === "formChanged") {
    // S-07 / S-08 / S-09, applied to each instance independently
    let next = state;
    for (const kind of ["quote", "draft"] as const) {
      if (FINISHED.includes(next[kind])) next = resetInstance(next, kind);
    }
    return next;
  }

  const current = state[event.kind];

  switch (event.type) {
    case "saveClicked":
      if (current === "SAVING") return state; // S-02: duplicate ignored, submitted version unchanged
      return event.kind === "quote" // S-01, S-10: a fresh save from IDLE or any finished state
        ? { ...state, quote: "SAVING", quoteError: null, quoteSubmittedVersion: event.version }
        : { ...state, draft: "SAVING", draftSubmittedVersion: event.version };
    case "saveSucceeded":
      return current === "SAVING" ? withStatus(state, event.kind, "SAVED") : illegal(state, event); // S-03
    case "saveSoftFailed":
    case "saveNetworkError":
      return current === "SAVING" ? withStatus(state, event.kind, "FAILED_SOFT") : illegal(state, event); // S-04, S-05
    case "save422":
      if (current === "SAVING" && event.kind === "quote") {
        return { ...state, quote: "INVALID", quoteError: event.detail }; // S-06
      }
      return illegal(state, event);
    case "toastDismissed":
      return FINISHED.includes(current) ? resetInstance(state, event.kind) : illegal(state, event); // S-07
  }
}
