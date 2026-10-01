import { saveReducer, initialSaveState, type SaveState, type SaveEvent, type SaveStatus } from "./saveMachine";

const st = (over: Partial<SaveState> = {}): SaveState => ({ ...initialSaveState, ...over });
const saving = (kind: "quote" | "draft", v = 3): SaveState =>
  kind === "quote"
    ? st({ quote: "SAVING", quoteSubmittedVersion: v })
    : st({ draft: "SAVING", draftSubmittedVersion: v });

describe("F-State-Save reducer (Artifact 3, S-01…S-10)", () => {
  test("initial state: both instances IDLE", () => {
    expect(initialSaveState).toEqual({
      quote: "IDLE",
      draft: "IDLE",
      quoteError: null,
      quoteSubmittedVersion: null,
      draftSubmittedVersion: null,
    });
  });

  test("S01 S-01 IDLE + saveClicked -> SAVING and records the submitted version (per kind)", () => {
    expect(saveReducer(st(), { type: "saveClicked", kind: "quote", version: 7 })).toEqual(
      st({ quote: "SAVING", quoteSubmittedVersion: 7 }),
    );
    expect(saveReducer(st(), { type: "saveClicked", kind: "draft", version: 9 })).toEqual(
      st({ draft: "SAVING", draftSubmittedVersion: 9 }),
    );
  });

  test("S02 S-02 SAVING + saveClicked is ignored, submitted version kept", () => {
    const before = saving("quote", 3);
    expect(saveReducer(before, { type: "saveClicked", kind: "quote", version: 8 })).toEqual(before);
  });

  test("S03 S-03 SAVING + saveSucceeded -> SAVED, submitted version retained for M4", () => {
    expect(saveReducer(saving("quote", 3), { type: "saveSucceeded", kind: "quote", version: 3 })).toEqual(
      st({ quote: "SAVED", quoteSubmittedVersion: 3 }),
    );
    expect(saveReducer(saving("draft", 4), { type: "saveSucceeded", kind: "draft", version: 4 })).toEqual(
      st({ draft: "SAVED", draftSubmittedVersion: 4 }),
    );
  });

  test("S04 S-04 SAVING + saveSoftFailed -> FAILED_SOFT", () => {
    expect(saveReducer(saving("quote"), { type: "saveSoftFailed", kind: "quote" }).quote).toBe("FAILED_SOFT");
    expect(saveReducer(saving("draft"), { type: "saveSoftFailed", kind: "draft" }).draft).toBe("FAILED_SOFT");
  });

  test("S05 S-05 SAVING + saveNetworkError -> FAILED_SOFT", () => {
    expect(saveReducer(saving("quote"), { type: "saveNetworkError", kind: "quote" }).quote).toBe("FAILED_SOFT");
    expect(saveReducer(saving("draft"), { type: "saveNetworkError", kind: "draft" }).draft).toBe("FAILED_SOFT");
  });

  test("S06 S-06 SAVING + save422(quote) -> INVALID with server detail", () => {
    expect(saveReducer(saving("quote"), { type: "save422", kind: "quote", detail: "bad" })).toEqual(
      st({ quote: "INVALID", quoteError: "bad", quoteSubmittedVersion: 3 }),
    );
  });

  test("S07 S-07 SAVED / FAILED_SOFT / INVALID -> IDLE on toastDismissed", () => {
    for (const s of ["SAVED", "FAILED_SOFT", "INVALID"] as SaveStatus[]) {
      const next = saveReducer(st({ quote: s, quoteError: "e", quoteSubmittedVersion: 3 }), {
        type: "toastDismissed",
        kind: "quote",
      });
      expect(next).toEqual(st());
    }
  });

  test("S07 S-07 toastDismissed(draft) leaves the quote instance and its error alone", () => {
    const before = st({ quote: "INVALID", quoteError: "e", draft: "SAVED", draftSubmittedVersion: 2 });
    expect(saveReducer(before, { type: "toastDismissed", kind: "draft" })).toEqual(
      st({ quote: "INVALID", quoteError: "e" }),
    );
  });

  test("S07 S-07 formChanged returns every finished instance to IDLE", () => {
    const before = st({ quote: "INVALID", quoteError: "e", draft: "FAILED_SOFT", draftSubmittedVersion: 2 });
    expect(saveReducer(before, { type: "formChanged" })).toEqual(st());
  });

  test("S08 S-08 SAVING + formChanged is ignored (save neither cancelled nor lost)", () => {
    const before = saving("quote", 3);
    expect(saveReducer(before, { type: "formChanged" })).toEqual(before);
  });

  test("S08 S-08 formChanged with one instance SAVING and the other finished: only the finished one resets", () => {
    const before = st({ quote: "SAVING", quoteSubmittedVersion: 3, draft: "SAVED", draftSubmittedVersion: 2 });
    expect(saveReducer(before, { type: "formChanged" })).toEqual(
      st({ quote: "SAVING", quoteSubmittedVersion: 3 }),
    );
  });

  test("S09 [AMENDMENT] IDLE + formChanged is ignored, no throw", () => {
    expect(saveReducer(st(), { type: "formChanged" })).toEqual(st());
  });

  test("instances are independent: quote SAVING does not block a draft save", () => {
    const next = saveReducer(saving("quote", 3), { type: "saveClicked", kind: "draft", version: 3 });
    expect(next.quote).toBe("SAVING");
    expect(next.draft).toBe("SAVING");
  });

  test("S10 S-10 SAVED / FAILED_SOFT / INVALID + saveClicked -> SAVING with a fresh submitted version", () => {
    for (const s of ["SAVED", "FAILED_SOFT", "INVALID"] as SaveStatus[]) {
      const before = st({ quote: s, quoteError: s === "INVALID" ? "old" : null, quoteSubmittedVersion: 3 });
      expect(saveReducer(before, { type: "saveClicked", kind: "quote", version: 8 })).toEqual(
        st({ quote: "SAVING", quoteSubmittedVersion: 8, quoteError: null }),
      );
      const beforeDraft = st({ draft: s, draftSubmittedVersion: 3 });
      expect(saveReducer(beforeDraft, { type: "saveClicked", kind: "draft", version: 8 })).toEqual(
        st({ draft: "SAVING", draftSubmittedVersion: 8 }),
      );
    }
  });

  test("S21 a previous success does not block a new save, and the new save completes normally", () => {
    let s = saveReducer(st(), { type: "saveClicked", kind: "draft", version: 1 });
    s = saveReducer(s, { type: "saveSucceeded", kind: "draft", version: 1 });
    s = saveReducer(s, { type: "saveClicked", kind: "draft", version: 2 });
    expect(s.draftSubmittedVersion).toBe(2);
    s = saveReducer(s, { type: "saveSucceeded", kind: "draft", version: 2 });
    expect(s.draft).toBe("SAVED");
  });

  test("S22 a previous failure does not block a retry, and the stale quote error is cleared", () => {
    let s = saveReducer(st(), { type: "saveClicked", kind: "quote", version: 1 });
    s = saveReducer(s, { type: "save422", kind: "quote", detail: "bad" });
    s = saveReducer(s, { type: "saveClicked", kind: "quote", version: 2 });
    expect(s).toEqual(st({ quote: "SAVING", quoteSubmittedVersion: 2 }));
    s = saveReducer(s, { type: "saveSoftFailed", kind: "quote" });
    s = saveReducer(s, { type: "saveClicked", kind: "quote", version: 3 });
    expect(s.quote).toBe("SAVING");
  });

  test("S23 SAVING + saveClicked and + formChanged keep the submitted version unchanged", () => {
    let s = saving("quote", 3);
    s = saveReducer(s, { type: "saveClicked", kind: "quote", version: 9 });
    s = saveReducer(s, { type: "formChanged" });
    expect(s).toEqual(saving("quote", 3));
  });

  test("S99 unlisted pairs throw", () => {
    const events: [SaveState, SaveEvent][] = [
      [st(), { type: "saveSucceeded", kind: "quote", version: 1 }],
      [st(), { type: "saveSoftFailed", kind: "quote" }],
      [st(), { type: "saveNetworkError", kind: "draft" }],
      [st(), { type: "save422", kind: "quote", detail: "x" }],
      [st(), { type: "toastDismissed", kind: "quote" }],
      [saving("quote"), { type: "toastDismissed", kind: "quote" }],
      [saving("draft"), { type: "save422", kind: "draft", detail: "x" }],
      [st({ quote: "FAILED_SOFT" }), { type: "saveSucceeded", kind: "quote", version: 3 }],
    ];
    for (const [s, e] of events) expect(() => saveReducer(s, e)).toThrow();
  });
});
