import { describe, expect, test } from "vitest";
import { buildFieldRecognitionVM, type RecognitionOutcome } from "./fieldRecognition";

const strIsEmpty = (v: string) => v.trim() === "";
const strEq = (a: string, b: string) => a === b;
const caption = (outcome: RecognitionOutcome, value: string) => ({ kind: outcome === "offer" ? ("offer" as const) : outcome === "recognised" ? ("ok" as const) : ("warn" as const), key: outcome, params: { value } });

describe("buildFieldRecognitionVM", () => {
  test("empty field + match -> fill, caption describes the new value", () => {
    expect(buildFieldRecognitionVM("", strIsEmpty, "A", strEq, caption)).toEqual({
      value: "A",
      caption: { kind: "ok", key: "recognised", params: { value: "A" } },
    });
  });

  test("empty field + no match -> noMatch, caption describes the (empty) current value", () => {
    expect(buildFieldRecognitionVM("", strIsEmpty, null, strEq, caption)).toEqual({
      value: null,
      caption: { kind: "warn", key: "noMatch", params: { value: "" } },
    });
  });

  test("field has a value + no match -> kept, caption describes the current value (found 2026-09-23: must not stay silent)", () => {
    expect(buildFieldRecognitionVM("FIO", strIsEmpty, null, strEq, caption)).toEqual({
      value: null,
      caption: { kind: "warn", key: "kept", params: { value: "FIO" } },
    });
  });

  test("field has a value that matches the proposal exactly -> noop, no caption at all", () => {
    expect(buildFieldRecognitionVM("A", strIsEmpty, "A", strEq, caption)).toEqual({ value: null, caption: null });
  });

  test("field has a different value -> offer, never applied automatically", () => {
    expect(buildFieldRecognitionVM("A", strIsEmpty, "B", strEq, caption)).toEqual({
      value: null,
      caption: { kind: "offer", key: "offer", params: { value: "B" } },
      offerValue: "B",
    });
  });

  test("works with a non-scalar T (list), using a content-based equality/emptiness check", () => {
    const listIsEmpty = (v: string[]) => v.length === 0;
    const listEq = (a: string[], b: string[]) => JSON.stringify(a) === JSON.stringify(b);
    const listCaption = (outcome: RecognitionOutcome, value: string[]) => ({ kind: "ok" as const, key: outcome, params: { value: value.join(",") } });
    expect(buildFieldRecognitionVM([], listIsEmpty, ["A", "B"], listEq, listCaption)).toEqual({
      value: ["A", "B"],
      caption: { kind: "ok", key: "recognised", params: { value: "A,B" } },
    });
  });
});
