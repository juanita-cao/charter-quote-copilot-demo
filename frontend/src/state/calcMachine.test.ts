import { calcReducer, initialCalcState, type CalcState, type CalcEvent, type CalcStatus } from "./calcMachine";

const st = (status: CalcStatus, seq = 5, errorMessage: string | null = null): CalcState => ({ status, seq, errorMessage });
const run = (complete: boolean): CalcEvent => ({ type: "runClicked", complete });
const changed: CalcEvent = { type: "formChanged" };
const ALL: CalcStatus[] = ["IDLE", "INCOMPLETE", "CALCULATING", "READY", "STALE", "INVALID", "UNAVAILABLE"];
const NOT_CALCULATING = ALL.filter((s) => s !== "CALCULATING");

// M2 after the client's decision (2026-09-21): the operator controls calculation. Nothing calculates until Run is
// clicked — the first time, and again after every change of the inputs.
describe("F-State-Calc reducer (manual Run)", () => {
  test("initial state: IDLE with seq 0 — nothing has been run", () => {
    expect(initialCalcState).toEqual({ status: "IDLE", seq: 0, errorMessage: null });
  });

  test("S01 C-01 IDLE + runClicked(complete) -> CALCULATING, seq++", () => {
    expect(calcReducer(st("IDLE"), run(true))).toEqual(st("CALCULATING", 6));
  });
  test("S02 C-02 IDLE + runClicked(incomplete) -> INCOMPLETE, seq++", () => {
    expect(calcReducer(st("IDLE"), run(false))).toEqual(st("INCOMPLETE", 6));
  });
  test("S03 C-03 every settled state + runClicked(complete) -> CALCULATING, seq++, error cleared", () => {
    for (const s of ["INCOMPLETE", "READY", "STALE", "INVALID", "UNAVAILABLE"] as CalcStatus[]) {
      expect(calcReducer(st(s, 5, "old"), run(true))).toEqual(st("CALCULATING", 6));
    }
  });
  test("S04 C-04 every settled state + runClicked(incomplete) -> INCOMPLETE, seq++, error cleared", () => {
    for (const s of ["INCOMPLETE", "READY", "STALE", "INVALID", "UNAVAILABLE"] as CalcStatus[]) {
      expect(calcReducer(st(s, 5, "old"), run(false))).toEqual(st("INCOMPLETE", 6));
    }
  });
  test("S05 C-05 CALCULATING + runClicked is ignored (a duplicate click), state unchanged", () => {
    const before = st("CALCULATING", 5);
    expect(calcReducer(before, run(true))).toEqual(before);
    expect(calcReducer(before, run(false))).toEqual(before);
  });

  test("S06 C-06 IDLE / INCOMPLETE + formChanged -> unchanged (there is no result to go stale)", () => {
    expect(calcReducer(st("IDLE"), changed)).toEqual(st("IDLE"));
    expect(calcReducer(st("INCOMPLETE"), changed)).toEqual(st("INCOMPLETE"));
  });
  test("S07 C-07 READY / INVALID / UNAVAILABLE + formChanged -> STALE (nothing recalculates), seq kept, error cleared", () => {
    for (const s of ["READY", "INVALID", "UNAVAILABLE"] as CalcStatus[]) {
      expect(calcReducer(st(s, 5, "e"), changed)).toEqual(st("STALE", 5));
    }
  });
  test("S08 C-08 STALE + formChanged -> STALE, unchanged", () => {
    expect(calcReducer(st("STALE"), changed)).toEqual(st("STALE"));
  });
  test("S09 C-09 CALCULATING + formChanged -> STALE with seq++ (the in-flight response is now stale)", () => {
    expect(calcReducer(st("CALCULATING"), changed)).toEqual(st("STALE", 6));
  });

  test("S10 C-10 CALCULATING + fresh calcSucceeded -> READY, error cleared", () => {
    expect(calcReducer(st("CALCULATING"), { type: "calcSucceeded", seq: 5 })).toEqual(st("READY"));
  });
  test("S11 C-11 stale result events are ignored in every state, no throw", () => {
    for (const s of ALL) {
      const before = st(s, 5, "keep");
      expect(calcReducer(before, { type: "calcSucceeded", seq: 4 })).toEqual(before);
      expect(calcReducer(before, { type: "calc422", seq: 4, detail: "x" })).toEqual(before);
      expect(calcReducer(before, { type: "calcFailed", seq: 4 })).toEqual(before);
    }
  });
  test("S12 C-12 CALCULATING + fresh calc422 -> INVALID with the server's detail", () => {
    expect(calcReducer(st("CALCULATING"), { type: "calc422", seq: 5, detail: "bad quantity" })).toEqual(st("INVALID", 5, "bad quantity"));
  });
  test("S13 C-13 CALCULATING + fresh calcFailed -> UNAVAILABLE with a generic message", () => {
    const next = calcReducer(st("CALCULATING"), { type: "calcFailed", seq: 5 });
    expect(next.status).toBe("UNAVAILABLE");
    expect(next.seq).toBe(5);
    expect(next.errorMessage).toBeTruthy();
  });
  test("S14 C-14 a fresh result outside CALCULATING throws (cannot happen by construction)", () => {
    for (const s of NOT_CALCULATING) {
      expect(() => calcReducer(st(s), { type: "calcSucceeded", seq: 5 })).toThrow();
      expect(() => calcReducer(st(s), { type: "calc422", seq: 5, detail: "x" })).toThrow();
      expect(() => calcReducer(st(s), { type: "calcFailed", seq: 5 })).toThrow();
    }
  });

  test("[CLIENT] editing the inputs never starts a calculation: no formChanged ever yields CALCULATING", () => {
    for (const s of ALL) expect(calcReducer(st(s), changed).status).not.toBe("CALCULATING");
  });
  test("[CLIENT] after an edit, only Run gets a fresh result: READY -> STALE -> Run -> CALCULATING -> READY", () => {
    let s = calcReducer(st("IDLE"), run(true)); // first Run
    s = calcReducer(s, { type: "calcSucceeded", seq: s.seq });
    expect(s.status).toBe("READY");
    s = calcReducer(s, changed);
    expect(s.status).toBe("STALE");
    s = calcReducer(s, changed);
    expect(s.status).toBe("STALE");
    s = calcReducer(s, run(true)); // Run again
    expect(s.status).toBe("CALCULATING");
    s = calcReducer(s, { type: "calcSucceeded", seq: s.seq });
    expect(s.status).toBe("READY");
  });
  test("[CLIENT] a slow response from before an edit cannot turn a STALE result back into READY", () => {
    let s = calcReducer(st("IDLE"), run(true));
    const inFlight = s.seq;
    s = calcReducer(s, changed); // edit while calculating
    expect(s.status).toBe("STALE");
    expect(calcReducer(s, { type: "calcSucceeded", seq: inFlight })).toEqual(s);
  });

  test("the reducer is pure: input state is not mutated", () => {
    const before = Object.freeze(st("READY"));
    expect(() => calcReducer(before, changed)).not.toThrow();
  });
  test("an unknown event throws", () => {
    expect(() => calcReducer(st("READY"), { type: "nope" } as never)).toThrow();
  });
});

describe("M2 formCleared (New quote): back to IDLE from anywhere, and late results are ignored", () => {
  const states = [
    { status: "IDLE", seq: 0, errorMessage: null },
    { status: "INCOMPLETE", seq: 2, errorMessage: null },
    { status: "CALCULATING", seq: 3, errorMessage: null },
    { status: "READY", seq: 3, errorMessage: null },
    { status: "STALE", seq: 3, errorMessage: null },
    { status: "INVALID", seq: 3, errorMessage: "bad" },
    { status: "UNAVAILABLE", seq: 3, errorMessage: "down" },
  ] as const;

  test.each(states)("from $status -> IDLE, seq advances, no message", (s) => {
    const next = calcReducer({ ...s }, { type: "formCleared" });
    expect(next).toEqual({ status: "IDLE", seq: s.seq + 1, errorMessage: null });
  });

  test("a result of the request that was in flight is stale afterwards and is ignored", () => {
    const cleared = calcReducer({ status: "CALCULATING", seq: 3, errorMessage: null }, { type: "formCleared" });
    expect(calcReducer(cleared, { type: "calcSucceeded", seq: 3 })).toEqual(cleared);
    expect(calcReducer(cleared, { type: "calc422", seq: 3, detail: "x" })).toEqual(cleared);
    expect(calcReducer(cleared, { type: "calcFailed", seq: 3 })).toEqual(cleared);
  });

  test("Run works again afterwards", () => {
    const cleared = calcReducer({ status: "READY", seq: 3, errorMessage: null }, { type: "formCleared" });
    expect(calcReducer(cleared, { type: "runClicked", complete: true }).status).toBe("CALCULATING");
  });
});

