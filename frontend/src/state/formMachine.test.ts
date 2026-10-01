import { formReducer, initialFormState, type FormLifecycleState, type FormEvent, type LoadPayload } from "./formMachine";

const st = (over: Partial<FormLifecycleState> = {}): FormLifecycleState => ({ ...initialFormState, ...over });
const payload = (source: LoadPayload["source"] = "history"): LoadPayload => ({
  source,
  kind: "quote",
  values: { route: "A-B" },
});

describe("F-State-Form reducer (Artifact 3, F-01…F-19)", () => {
  test("initial state: clean, version 0, no pending load, banner HIDDEN", () => {
    expect(initialFormState).toEqual({ dirty: false, formVersion: 0, pendingLoad: null, banner: "HIDDEN" });
  });

  test("S01 F-01 clean + userEdited -> dirty, formVersion++", () => {
    expect(formReducer(st({ formVersion: 4 }), { type: "userEdited" })).toEqual(st({ dirty: true, formVersion: 5 }));
  });
  test("S02 F-02 dirty + userEdited -> dirty, formVersion++", () => {
    expect(formReducer(st({ dirty: true, formVersion: 4 }), { type: "userEdited" })).toEqual(
      st({ dirty: true, formVersion: 5 }),
    );
  });
  test("S03 F-03 loadRequested while clean -> applied at once: clean, formVersion++, nothing pending", () => {
    expect(formReducer(st({ formVersion: 4 }), { type: "loadRequested", payload: payload() })).toEqual(
      st({ dirty: false, formVersion: 5, pendingLoad: null }),
    );
  });
  test("S04 F-04 loadRequested while dirty -> pendingLoad set, nothing else changes (banner included)", () => {
    const before = st({ dirty: true, formVersion: 4, banner: "SHOWN" });
    const p = payload("draft-banner");
    expect(formReducer(before, { type: "loadRequested", payload: p })).toEqual({ ...before, pendingLoad: p });
  });
  test("S05 F-05 replaceConfirmed -> clean, pendingLoad cleared, formVersion++", () => {
    const p = payload();
    expect(formReducer(st({ dirty: true, formVersion: 4, pendingLoad: p }), { type: "replaceConfirmed" })).toEqual(
      st({ dirty: false, formVersion: 5, pendingLoad: null }),
    );
  });
  test("S06 F-06 replaceCancelled -> pendingLoad cleared; dirty, formVersion and banner untouched", () => {
    const before = st({ dirty: true, formVersion: 4, pendingLoad: payload("draft-banner"), banner: "SHOWN" });
    expect(formReducer(before, { type: "replaceCancelled" })).toEqual({ ...before, pendingLoad: null });
  });
  test("S07 F-07 dirty + saved(v === formVersion) -> clean", () => {
    expect(formReducer(st({ dirty: true, formVersion: 4 }), { type: "saved", version: 4 })).toEqual(
      st({ dirty: false, formVersion: 4 }),
    );
  });
  test("S08 F-08 formReset -> clean, formVersion++", () => {
    expect(formReducer(st({ dirty: true, formVersion: 4 }), { type: "formReset" })).toEqual(
      st({ dirty: false, formVersion: 5 }),
    );
    expect(formReducer(st({ formVersion: 4 }), { type: "formReset" })).toEqual(st({ dirty: false, formVersion: 5 }));
  });
  test("S09 F-09 HIDDEN + draftLatestLoaded(exists) -> SHOWN", () => {
    expect(formReducer(st(), { type: "draftLatestLoaded", exists: true }).banner).toBe("SHOWN");
  });
  test("S10 F-10 HIDDEN + draftLatestLoaded(none) -> HIDDEN", () => {
    expect(formReducer(st(), { type: "draftLatestLoaded", exists: false }).banner).toBe("HIDDEN");
  });
  test("S11 F-11 SHOWN + dismissClicked -> DISMISSED", () => {
    expect(formReducer(st({ banner: "SHOWN" }), { type: "dismissClicked" }).banner).toBe("DISMISSED");
  });
  test("S12 F-12 SHOWN + resumeClicked -> unchanged", () => {
    const before = st({ banner: "SHOWN", dirty: true });
    expect(formReducer(before, { type: "resumeClicked" })).toEqual(before);
  });
  test("S13 F-13 SHOWN / DISMISSED + draftLatestLoaded -> unchanged (once per session)", () => {
    for (const banner of ["SHOWN", "DISMISSED"] as const) {
      for (const exists of [true, false]) {
        expect(formReducer(st({ banner }), { type: "draftLatestLoaded", exists }).banner).toBe(banner);
      }
    }
  });
  test("S14 F-14 prefillApplied -> dirty, formVersion++", () => {
    expect(formReducer(st({ formVersion: 4 }), { type: "prefillApplied" })).toEqual(st({ dirty: true, formVersion: 5 }));
    expect(formReducer(st({ dirty: true, formVersion: 4 }), { type: "prefillApplied" })).toEqual(
      st({ dirty: true, formVersion: 5 }),
    );
  });
  test("S15 F-15 dirty + saved(v !== formVersion) -> stays dirty (an edit landed during the save)", () => {
    expect(formReducer(st({ dirty: true, formVersion: 5 }), { type: "saved", version: 4 })).toEqual(
      st({ dirty: true, formVersion: 5 }),
    );
  });
  test("S16 F-16 clean + saved(v) -> clean", () => {
    expect(formReducer(st({ formVersion: 4 }), { type: "saved", version: 4 })).toEqual(st({ formVersion: 4 }));
    expect(formReducer(st({ formVersion: 5 }), { type: "saved", version: 4 })).toEqual(st({ formVersion: 5 }));
  });
  test("S17 F-17 SHOWN + loadApplied(draft-banner) -> DISMISSED", () => {
    expect(formReducer(st({ banner: "SHOWN" }), { type: "loadApplied", source: "draft-banner" }).banner).toBe(
      "DISMISSED",
    );
  });
  test("S18 F-18 SHOWN + loadApplied(other source) -> SHOWN", () => {
    for (const source of ["search", "history"] as const) {
      expect(formReducer(st({ banner: "SHOWN" }), { type: "loadApplied", source }).banner).toBe("SHOWN");
    }
  });
  test("S19 F-19 HIDDEN / DISMISSED + loadApplied -> unchanged", () => {
    for (const banner of ["HIDDEN", "DISMISSED"] as const) {
      for (const source of ["draft-banner", "search", "history"] as const) {
        expect(formReducer(st({ banner }), { type: "loadApplied", source }).banner).toBe(banner);
      }
    }
  });

  test("[REVIEW 3] a cancelled Resume keeps the banner; a confirmed one dismisses it only via loadApplied", () => {
    let s = st({ dirty: true, banner: "SHOWN" });
    s = formReducer(s, { type: "resumeClicked" });
    s = formReducer(s, { type: "loadRequested", payload: payload("draft-banner") });
    s = formReducer(s, { type: "replaceCancelled" });
    expect(s.banner).toBe("SHOWN");
    s = formReducer(s, { type: "loadRequested", payload: payload("draft-banner") });
    s = formReducer(s, { type: "replaceConfirmed" });
    expect(s.banner).toBe("SHOWN");
    s = formReducer(s, { type: "loadApplied", source: "draft-banner" });
    expect(s.banner).toBe("DISMISSED");
  });

  test("[REVIEW 2] an edit during a save keeps the form dirty; an unchanged form is cleaned", () => {
    let s = st({ dirty: true, formVersion: 4 });
    s = formReducer(s, { type: "userEdited" });
    s = formReducer(s, { type: "saved", version: 4 });
    expect(s.dirty).toBe(true);
    s = formReducer(s, { type: "saved", version: 5 });
    expect(s.dirty).toBe(false);
  });

  test("formVersion increases on every value-changing event and never otherwise", () => {
    let s = st();
    const bumping: FormEvent[] = [
      { type: "userEdited" },
      { type: "prefillApplied" },
      { type: "formReset" },
      { type: "loadRequested", payload: payload() },
    ];
    for (const e of bumping) {
      const before = s.formVersion;
      s = formReducer(s, e);
      expect(s.formVersion).toBe(before + 1);
    }
    const before = s.formVersion;
    s = formReducer(s, { type: "saved", version: before });
    s = formReducer(s, { type: "draftLatestLoaded", exists: true });
    s = formReducer(s, { type: "dismissClicked" });
    expect(s.formVersion).toBe(before);
  });

  test("S99 unlisted pairs throw", () => {
    const cases: [FormLifecycleState, FormEvent][] = [
      [st(), { type: "replaceConfirmed" }],
      [st(), { type: "replaceCancelled" }],
      [st({ banner: "HIDDEN" }), { type: "dismissClicked" }],
      [st({ banner: "DISMISSED" }), { type: "dismissClicked" }],
      [st({ banner: "HIDDEN" }), { type: "resumeClicked" }],
      [st({ banner: "DISMISSED" }), { type: "resumeClicked" }],
      [st({ dirty: true, pendingLoad: payload() }), { type: "loadRequested", payload: payload("search") }],
    ];
    for (const [s, e] of cases) expect(() => formReducer(s, e)).toThrow();
  });
});
