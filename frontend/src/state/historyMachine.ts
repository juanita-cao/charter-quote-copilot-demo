export type ListStatus = "LOADING" | "LISTED" | "EMPTY" | "ERROR";
export type DeleteStatus =
  | "DEL_IDLE"
  | "DEL_CONFIRMING"
  | "DEL_RUNNING"
  | "DEL_DONE"
  | "DEL_PARTIAL_FAIL"
  | "DEL_FAILED";
export type HistoryPill = "ALL" | "QUOTES" | "DRAFTS";
export type MonthRange = [string, string];

export interface DeleteReport {
  quotesDeleted: number;
  draftsDeleted: number;
  failed: ("quotes" | "drafts")[];
}

export interface HistoryFilters {
  route: string;
  cargo_description: string;
  vessel_name: string;
  vessel_dwt: number;
}

export interface HistoryUiState {
  listStatus: ListStatus;
  listSeq: number;
  monthRange: MonthRange;
  filters: HistoryFilters | null;
  pill: HistoryPill;
  selection: string[];
  deleteStatus: DeleteStatus;
  deleteTargets: string[];
  deleteReport: DeleteReport | null;
}

export type HistoryEvent =
  | { type: "rangeChanged"; monthRange: MonthRange }
  | { type: "searchSubmitted"; filters: HistoryFilters }
  | { type: "resetClicked"; monthRange: MonthRange }
  | { type: "refetchRequested" }
  | { type: "retryClicked" }
  | { type: "pillChanged"; pill: HistoryPill }
  | { type: "rowToggled"; key: string; visibleKeys: string[] }
  | { type: "selectAllToggled"; visibleKeys: string[] }
  | { type: "loadRowClicked"; key: string }
  | { type: "listsLoaded"; listSeq: number; rowCount: number }
  | { type: "listsFailed"; listSeq: number }
  | { type: "deleteClicked" }
  | { type: "cancelled" }
  | { type: "confirmed" }
  | { type: "allSucceeded"; report: DeleteReport }
  | { type: "someFailed"; report: DeleteReport }
  | { type: "allFailed"; report: DeleteReport }
  | { type: "acknowledged" };

export function initialHistoryState(monthRange: MonthRange): HistoryUiState {
  return {
    listStatus: "LOADING",
    listSeq: 1,
    monthRange,
    filters: null,
    pill: "ALL",
    selection: [],
    deleteStatus: "DEL_IDLE",
    deleteTargets: [],
    deleteReport: null,
  };
}

const illegal = (state: HistoryUiState, event: HistoryEvent): never => {
  throw new Error(
    `historyReducer: illegal event ${event.type} (listStatus=${state.listStatus}, deleteStatus=${state.deleteStatus})`,
  );
};

const startLoading = (state: HistoryUiState, patch: Partial<HistoryUiState> = {}): HistoryUiState => ({
  ...state,
  ...patch,
  listStatus: "LOADING",
  listSeq: state.listSeq + 1,
  selection: [],
});

export function historyReducer(state: HistoryUiState, event: HistoryEvent): HistoryUiState {
  switch (event.type) {
    // ── list dimension ──
    case "rangeChanged": // H-03
      return startLoading(state, { monthRange: event.monthRange, filters: null });
    case "searchSubmitted": // H-03
      return startLoading(state, { filters: event.filters });
    case "resetClicked": // H-03
      return startLoading(state, { monthRange: event.monthRange, filters: null });
    case "refetchRequested": // H-03
      return startLoading(state);

    case "retryClicked": // H-16
      return state.listStatus === "ERROR" ? startLoading(state) : illegal(state, event);

    case "pillChanged": // H-04
      return { ...state, pill: event.pill, selection: [] };

    case "rowToggled": { // H-05
      if (state.listStatus !== "LISTED" || !event.visibleKeys.includes(event.key)) return illegal(state, event);
      const selection = state.selection.includes(event.key)
        ? state.selection.filter((k) => k !== event.key)
        : [...state.selection, event.key];
      return { ...state, selection };
    }
    case "selectAllToggled": { // H-06
      if (state.listStatus !== "LISTED") return illegal(state, event);
      const allSelected =
        event.visibleKeys.length > 0 && event.visibleKeys.every((k) => state.selection.includes(k));
      return { ...state, selection: allSelected ? [] : [...event.visibleKeys] };
    }

    case "loadRowClicked": // H-14
      return state.listStatus === "LISTED" ? state : illegal(state, event);

    case "listsLoaded":
    case "listsFailed": {
      if (event.listSeq !== state.listSeq) return state; // H-17: stale, ignored
      if (state.listStatus !== "LOADING") return illegal(state, event); // H-18
      if (event.type === "listsFailed") return { ...state, listStatus: "ERROR" }; // H-15
      return { ...state, listStatus: event.rowCount > 0 ? "LISTED" : "EMPTY" }; // H-01, H-02
    }

    // ── delete dimension (never touches list fields other than `selection`, H-10…H-12) ──
    case "deleteClicked": // H-07
      if (state.deleteStatus !== "DEL_IDLE" || state.listStatus !== "LISTED" || state.selection.length === 0) {
        return illegal(state, event);
      }
      return { ...state, deleteStatus: "DEL_CONFIRMING", deleteTargets: [...state.selection] };
    case "cancelled": // H-08
      return state.deleteStatus === "DEL_CONFIRMING"
        ? { ...state, deleteStatus: "DEL_IDLE", deleteTargets: [] }
        : illegal(state, event);
    case "confirmed": // H-09
      return state.deleteStatus === "DEL_CONFIRMING" ? { ...state, deleteStatus: "DEL_RUNNING" } : illegal(state, event);
    case "allSucceeded": // H-10
      return state.deleteStatus === "DEL_RUNNING"
        ? { ...state, deleteStatus: "DEL_DONE", selection: [], deleteReport: event.report }
        : illegal(state, event);
    case "someFailed": // H-11
      return state.deleteStatus === "DEL_RUNNING"
        ? { ...state, deleteStatus: "DEL_PARTIAL_FAIL", selection: [], deleteReport: event.report }
        : illegal(state, event);
    case "allFailed": // H-12
      return state.deleteStatus === "DEL_RUNNING"
        ? { ...state, deleteStatus: "DEL_FAILED", deleteReport: event.report }
        : illegal(state, event);
    case "acknowledged": // H-13
      return state.deleteStatus === "DEL_DONE" ||
        state.deleteStatus === "DEL_PARTIAL_FAIL" ||
        state.deleteStatus === "DEL_FAILED"
        ? { ...state, deleteStatus: "DEL_IDLE", deleteTargets: [], deleteReport: null }
        : illegal(state, event);
  }
}
