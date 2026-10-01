import {
  historyReducer,
  initialHistoryState,
  type HistoryUiState,
  type HistoryEvent,
  type DeleteReport,
} from "./historyMachine";

const RANGE: [string, string] = ["2026-09", "2026-09"];
const st = (over: Partial<HistoryUiState> = {}): HistoryUiState => ({ ...initialHistoryState(RANGE), ...over });
const listed = (over: Partial<HistoryUiState> = {}) => st({ listStatus: "LISTED", listSeq: 3, ...over });
const report = (over: Partial<DeleteReport> = {}): DeleteReport => ({
  quotesDeleted: 1,
  draftsDeleted: 1,
  failed: [],
  ...over,
});

describe("F-State-History reducer (Artifact 3, H-01…H-19)", () => {
  test("initial state: LOADING request #1, month-range mode, nothing selected, no delete in progress", () => {
    expect(initialHistoryState(RANGE)).toEqual({
      listStatus: "LOADING",
      listSeq: 1,
      monthRange: RANGE,
      filters: null,
      pill: "ALL",
      selection: [],
      deleteStatus: "DEL_IDLE",
      deleteTargets: [],
      deleteReport: null,
    });
  });

  // ── list dimension ──
  test("S01 H-01 LOADING + fresh listsLoaded(rows>0) -> LISTED", () => {
    expect(historyReducer(st({ listSeq: 3 }), { type: "listsLoaded", listSeq: 3, rowCount: 4 }).listStatus).toBe("LISTED");
  });
  test("S02 H-02 LOADING + fresh listsLoaded(rows=0) -> EMPTY", () => {
    expect(historyReducer(st({ listSeq: 3 }), { type: "listsLoaded", listSeq: 3, rowCount: 0 }).listStatus).toBe("EMPTY");
  });

  test("S03 H-03 every list-changing event from every list status -> LOADING, listSeq++, selection cleared", () => {
    const events: HistoryEvent[] = [
      { type: "rangeChanged", monthRange: ["2026-08", "2026-09"] },
      { type: "searchSubmitted", filters: { route: "A", cargo_description: "", vessel_name: "", vessel_dwt: 0 } },
      { type: "resetClicked", monthRange: RANGE },
      { type: "refetchRequested" },
    ];
    for (const listStatus of ["LOADING", "LISTED", "EMPTY", "ERROR"] as const) {
      for (const e of events) {
        const next = historyReducer(st({ listStatus, listSeq: 3, selection: ["q1"] }), e);
        expect(next.listStatus).toBe("LOADING");
        expect(next.listSeq).toBe(4);
        expect(next.selection).toEqual([]);
      }
    }
  });
  test("S03 H-03 rangeChanged sets the range and returns to month-range mode; searchSubmitted sets filters; resetClicked clears filters", () => {
    const f = { route: "A", cargo_description: "", vessel_name: "", vessel_dwt: 0 };
    expect(historyReducer(st({ filters: f }), { type: "rangeChanged", monthRange: ["2026-01", "2026-02"] })).toMatchObject({
      monthRange: ["2026-01", "2026-02"],
      filters: null,
    });
    expect(historyReducer(st(), { type: "searchSubmitted", filters: f }).filters).toEqual(f);
    expect(historyReducer(st({ filters: f }), { type: "resetClicked", monthRange: RANGE })).toMatchObject({
      monthRange: RANGE,
      filters: null,
    });
  });
  test("S03 H-03 refetchRequested keeps the range and filters", () => {
    const f = { route: "A", cargo_description: "", vessel_name: "", vessel_dwt: 0 };
    expect(historyReducer(listed({ filters: f }), { type: "refetchRequested" })).toMatchObject({
      monthRange: RANGE,
      filters: f,
    });
  });

  test("S04 H-04 pillChanged -> pill set, selection cleared, listStatus and listSeq unchanged", () => {
    for (const listStatus of ["LOADING", "LISTED", "EMPTY", "ERROR"] as const) {
      const next = historyReducer(st({ listStatus, listSeq: 3, selection: ["q1"] }), { type: "pillChanged", pill: "DRAFTS" });
      expect(next).toMatchObject({ listStatus, listSeq: 3, pill: "DRAFTS", selection: [] });
    }
  });
  test("S05 H-05 rowToggled adds and removes a visible key", () => {
    const visibleKeys = ["q1", "q2", "d3"];
    let s = historyReducer(listed(), { type: "rowToggled", key: "q2", visibleKeys });
    expect(s.selection).toEqual(["q2"]);
    s = historyReducer(s, { type: "rowToggled", key: "d3", visibleKeys });
    expect(s.selection).toEqual(["q2", "d3"]);
    s = historyReducer(s, { type: "rowToggled", key: "q2", visibleKeys });
    expect(s.selection).toEqual(["d3"]);
  });
  test("S05 H-05 rowToggled for a key that is not a visible row throws (guard)", () => {
    expect(() => historyReducer(listed(), { type: "rowToggled", key: "q9", visibleKeys: ["q1"] })).toThrow();
  });
  test("S06 H-06 selectAllToggled selects every visible key, or clears when all were selected", () => {
    const visibleKeys = ["q1", "q2", "d3"];
    let s = historyReducer(listed({ selection: ["q1"] }), { type: "selectAllToggled", visibleKeys });
    expect(s.selection).toEqual(visibleKeys);
    s = historyReducer(s, { type: "selectAllToggled", visibleKeys });
    expect(s.selection).toEqual([]);
  });

  // ── delete dimension ──
  test("S07 H-07 DEL_IDLE + deleteClicked (LISTED, selection non-empty) -> DEL_CONFIRMING, deleteTargets captured", () => {
    const next = historyReducer(listed({ selection: ["q1", "d2"] }), { type: "deleteClicked" });
    expect(next.deleteStatus).toBe("DEL_CONFIRMING");
    expect(next.deleteTargets).toEqual(["q1", "d2"]);
  });
  test("S07 H-07 guard: not LISTED, or empty selection, throws", () => {
    expect(() => historyReducer(listed({ selection: [] }), { type: "deleteClicked" })).toThrow();
    expect(() => historyReducer(st({ listStatus: "EMPTY", selection: ["q1"] }), { type: "deleteClicked" })).toThrow();
    expect(() => historyReducer(st({ listStatus: "LOADING", selection: ["q1"] }), { type: "deleteClicked" })).toThrow();
  });
  test("S07 H-07 deleteClicked while a delete is already in flight throws", () => {
    expect(() =>
      historyReducer(listed({ selection: ["q1"], deleteStatus: "DEL_RUNNING", deleteTargets: ["q1"] }), { type: "deleteClicked" }),
    ).toThrow();
  });
  test("S08 H-08 DEL_CONFIRMING + cancelled -> DEL_IDLE, deleteTargets cleared, selection kept", () => {
    const next = historyReducer(listed({ selection: ["q1"], deleteStatus: "DEL_CONFIRMING", deleteTargets: ["q1"] }), {
      type: "cancelled",
    });
    expect(next).toMatchObject({ deleteStatus: "DEL_IDLE", deleteTargets: [], selection: ["q1"] });
  });
  test("S09 H-09 DEL_CONFIRMING + confirmed -> DEL_RUNNING, deleteTargets unchanged", () => {
    const next = historyReducer(listed({ deleteStatus: "DEL_CONFIRMING", deleteTargets: ["q1", "d2"] }), { type: "confirmed" });
    expect(next).toMatchObject({ deleteStatus: "DEL_RUNNING", deleteTargets: ["q1", "d2"] });
  });
  test("S10 H-10 DEL_RUNNING + allSucceeded -> DEL_DONE, selection cleared, report stored", () => {
    const r = report();
    const next = historyReducer(listed({ selection: ["q1"], deleteStatus: "DEL_RUNNING", deleteTargets: ["q1"] }), {
      type: "allSucceeded",
      report: r,
    });
    expect(next).toMatchObject({ deleteStatus: "DEL_DONE", selection: [], deleteReport: r });
  });
  test("S11 H-11 DEL_RUNNING + someFailed -> DEL_PARTIAL_FAIL, selection cleared, report names what failed", () => {
    const r = report({ draftsDeleted: 0, failed: ["drafts"] });
    const next = historyReducer(listed({ selection: ["q1", "d2"], deleteStatus: "DEL_RUNNING", deleteTargets: ["q1", "d2"] }), {
      type: "someFailed",
      report: r,
    });
    expect(next).toMatchObject({ deleteStatus: "DEL_PARTIAL_FAIL", selection: [], deleteReport: r });
  });
  test("S12 H-12 DEL_RUNNING + allFailed -> DEL_FAILED, selection KEPT", () => {
    const r = report({ quotesDeleted: 0, draftsDeleted: 0, failed: ["quotes"] });
    const next = historyReducer(listed({ selection: ["q1"], deleteStatus: "DEL_RUNNING", deleteTargets: ["q1"] }), {
      type: "allFailed",
      report: r,
    });
    expect(next).toMatchObject({ deleteStatus: "DEL_FAILED", selection: ["q1"], deleteReport: r });
  });
  test("S13 H-13 DEL_DONE / PARTIAL_FAIL / FAILED + acknowledged -> DEL_IDLE, report and targets cleared", () => {
    for (const deleteStatus of ["DEL_DONE", "DEL_PARTIAL_FAIL", "DEL_FAILED"] as const) {
      const next = historyReducer(listed({ deleteStatus, deleteTargets: ["q1"], deleteReport: report() }), { type: "acknowledged" });
      expect(next).toMatchObject({ deleteStatus: "DEL_IDLE", deleteTargets: [], deleteReport: null });
    }
  });
  test("S14 H-14 LISTED + loadRowClicked -> unchanged (effect is emitted by the hook)", () => {
    const before = listed({ selection: ["q1"] });
    expect(historyReducer(before, { type: "loadRowClicked", key: "q1" })).toEqual(before);
  });

  // ── list errors ──
  test("S15 H-15 LOADING + fresh listsFailed -> ERROR", () => {
    expect(historyReducer(st({ listSeq: 3 }), { type: "listsFailed", listSeq: 3 }).listStatus).toBe("ERROR");
  });
  test("S16 H-16 ERROR + retryClicked -> LOADING, listSeq++", () => {
    const next = historyReducer(st({ listStatus: "ERROR", listSeq: 3 }), { type: "retryClicked" });
    expect(next).toMatchObject({ listStatus: "LOADING", listSeq: 4 });
  });
  test("S17 H-17 stale listsLoaded / listsFailed are ignored in every list status, no throw", () => {
    for (const listStatus of ["LOADING", "LISTED", "EMPTY", "ERROR"] as const) {
      const before = st({ listStatus, listSeq: 5, selection: ["q1"] });
      expect(historyReducer(before, { type: "listsLoaded", listSeq: 4, rowCount: 3 })).toEqual(before);
      expect(historyReducer(before, { type: "listsFailed", listSeq: 4 })).toEqual(before);
    }
  });
  test("S18 H-18 a fresh listsLoaded / listsFailed outside LOADING throws", () => {
    for (const listStatus of ["LISTED", "EMPTY", "ERROR"] as const) {
      expect(() => historyReducer(st({ listStatus, listSeq: 5 }), { type: "listsLoaded", listSeq: 5, rowCount: 1 })).toThrow();
      expect(() => historyReducer(st({ listStatus, listSeq: 5 }), { type: "listsFailed", listSeq: 5 })).toThrow();
    }
  });
  test("S19 H-19 list-dimension events never change the delete dimension (R3)", () => {
    const deleteFields: Pick<HistoryUiState, "deleteStatus" | "deleteTargets" | "deleteReport"> = {
      deleteStatus: "DEL_RUNNING",
      deleteTargets: ["q1", "d2"],
      deleteReport: null,
    };
    const events: HistoryEvent[] = [
      { type: "rangeChanged", monthRange: ["2026-08", "2026-09"] },
      { type: "searchSubmitted", filters: { route: "A", cargo_description: "", vessel_name: "", vessel_dwt: 0 } },
      { type: "resetClicked", monthRange: RANGE },
      { type: "refetchRequested" },
      { type: "pillChanged", pill: "QUOTES" },
    ];
    for (const e of events) {
      expect(historyReducer(listed({ ...deleteFields }), e)).toMatchObject(deleteFields);
    }
    let s = historyReducer(listed({ ...deleteFields }), { type: "refetchRequested" });
    s = historyReducer(s, { type: "listsLoaded", listSeq: s.listSeq, rowCount: 2 });
    expect(s).toMatchObject(deleteFields);
    s = historyReducer(historyReducer(listed({ ...deleteFields }), { type: "refetchRequested" }), { type: "listsFailed", listSeq: 4 });
    expect(s).toMatchObject({ listStatus: "ERROR", ...deleteFields });
  });

  // ── regression / behaviour tests from the review ──
  test("[REVIEW 5] a range change while LOADING supersedes the pending pair: the older result is then stale", () => {
    let s = st({ listSeq: 3 });
    s = historyReducer(s, { type: "rangeChanged", monthRange: ["2026-08", "2026-08"] });
    expect(s.listSeq).toBe(4);
    const afterStale = historyReducer(s, { type: "listsLoaded", listSeq: 3, rowCount: 9 });
    expect(afterStale).toEqual(s);
    expect(historyReducer(s, { type: "listsLoaded", listSeq: 4, rowCount: 9 }).listStatus).toBe("LISTED");
  });
  test("[re-review] deleteTargets stay frozen when the selection changes or the list reloads while confirming", () => {
    let s = historyReducer(listed({ selection: ["q1", "d2"] }), { type: "deleteClicked" });
    s = historyReducer(s, { type: "rowToggled", key: "q1", visibleKeys: ["q1", "d2", "q3"] });
    expect(s.selection).toEqual(["d2"]);
    expect(s.deleteTargets).toEqual(["q1", "d2"]);
    s = historyReducer(s, { type: "refetchRequested" });
    expect(s.deleteTargets).toEqual(["q1", "d2"]);
    s = historyReducer(s, { type: "confirmed" });
    expect(s.deleteTargets).toEqual(["q1", "d2"]);
  });

  test("S99 unlisted pairs throw", () => {
    const cases: [HistoryUiState, HistoryEvent][] = [
      [listed(), { type: "retryClicked" }],
      [st({ listStatus: "LOADING" }), { type: "retryClicked" }],
      [st({ listStatus: "LOADING" }), { type: "rowToggled", key: "q1", visibleKeys: ["q1"] }],
      [st({ listStatus: "EMPTY" }), { type: "selectAllToggled", visibleKeys: [] }],
      [st({ listStatus: "ERROR" }), { type: "loadRowClicked", key: "q1" }],
      [listed(), { type: "cancelled" }],
      [listed(), { type: "confirmed" }],
      [listed(), { type: "allSucceeded", report: report() }],
      [listed({ deleteStatus: "DEL_CONFIRMING" }), { type: "someFailed", report: report() }],
      [listed({ deleteStatus: "DEL_RUNNING" }), { type: "acknowledged" }],
      [listed({ deleteStatus: "DEL_RUNNING" }), { type: "cancelled" }],
    ];
    for (const [s, e] of cases) expect(() => historyReducer(s, e)).toThrow();
  });
});
