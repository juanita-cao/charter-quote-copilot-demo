import { classifyDelete, partitionTargets } from "./deleteTargets";

describe("delete targets (H-09 … H-12 helpers)", () => {
  test("partitionTargets splits q/d keys into numeric ids", () => {
    expect(partitionTargets(["q12", "d7", "q3", "d9"])).toEqual({ quoteIds: [12, 3], draftIds: [7, 9] });
    expect(partitionTargets([])).toEqual({ quoteIds: [], draftIds: [] });
  });
  test("partitionTargets rejects a malformed key instead of guessing", () => {
    expect(() => partitionTargets(["x1"])).toThrow();
    expect(() => partitionTargets(["q"])).toThrow();
    expect(() => partitionTargets(["q1.5"])).toThrow();
  });
  test("all requested parts succeeded -> allSucceeded with counts", () => {
    expect(classifyDelete({ quotes: { requested: 2, deleted: 2, ok: true }, drafts: { requested: 1, deleted: 1, ok: true } })).toEqual({
      outcome: "allSucceeded",
      report: { quotesDeleted: 2, draftsDeleted: 1, failed: [] },
    });
  });
  test("a part with nothing requested is skipped, not a failure", () => {
    expect(classifyDelete({ quotes: { requested: 2, deleted: 2, ok: true }, drafts: { requested: 0, deleted: 0, ok: true } }).outcome).toBe(
      "allSucceeded",
    );
  });
  test("one part succeeded and one failed -> someFailed naming the failed part", () => {
    expect(classifyDelete({ quotes: { requested: 2, deleted: 2, ok: true }, drafts: { requested: 1, deleted: 0, ok: false } })).toEqual({
      outcome: "someFailed",
      report: { quotesDeleted: 2, draftsDeleted: 0, failed: ["drafts"] },
    });
  });
  test("every requested part failed -> allFailed", () => {
    expect(classifyDelete({ quotes: { requested: 2, deleted: 0, ok: false }, drafts: { requested: 1, deleted: 0, ok: false } })).toEqual({
      outcome: "allFailed",
      report: { quotesDeleted: 0, draftsDeleted: 0, failed: ["quotes", "drafts"] },
    });
    expect(classifyDelete({ quotes: { requested: 2, deleted: 0, ok: false }, drafts: { requested: 0, deleted: 0, ok: true } }).outcome).toBe(
      "allFailed",
    );
  });
});
