import { describe, expect, test } from "vitest";
import { decideRecognition } from "./recognitionRule";

describe("decideRecognition", () => {
  test("nothing proposed + field empty -> noMatch, hadValue false (worth a warning)", () => {
    expect(decideRecognition(true, null, false)).toEqual({ kind: "noMatch", hadValue: false });
  });

  test("nothing proposed + field already has something -> noMatch, hadValue true (kept, don't stay silent — found 2026-09-23)", () => {
    expect(decideRecognition(false, null, false)).toEqual({ kind: "noMatch", hadValue: true });
  });

  test("field empty + something proposed -> fill", () => {
    expect(decideRecognition(true, "A", false)).toEqual({ kind: "fill", value: "A" });
  });

  test("field non-empty + proposal matches current -> noop, nothing to say", () => {
    expect(decideRecognition(false, "A", true)).toEqual({ kind: "noop" });
  });

  test("field non-empty + proposal differs from current -> offer, never fill", () => {
    expect(decideRecognition(false, "B", false)).toEqual({ kind: "offer", value: "B" });
  });
});
