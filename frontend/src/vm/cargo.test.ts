import { describe, expect, test } from "vitest";
import { buildCargoRecognitionVM } from "./cargo";

// [AMENDMENT 2026-09-22] Rewritten for the stateless offer-not-overwrite rule (see cargo.ts's docstring for why the
// earlier "unconfirmed guess" memory-based guard was replaced): the function now only ever looks at the CURRENT
// enquiry text and the CURRENT field value, nothing else, so it behaves identically whether the current value came
// from a confirmed recognise, a hand-typed entry, or a page-reloaded draft.

describe("buildCargoRecognitionVM", () => {
  test("no enquiry text -> warn, no patch", () => {
    expect(buildCargoRecognitionVM(null, null)).toEqual({ patch: {}, caption: { kind: "warn", key: "cargoNoEnquiryText" } });
    expect(buildCargoRecognitionVM("   ", null)).toEqual({ patch: {}, caption: { kind: "warn", key: "cargoNoEnquiryText" } });
  });

  test("enquiry text with no recognisable cargo -> warn, no patch", () => {
    expect(buildCargoRecognitionVM("这段话里完全没有提到任何货物名称", null)).toEqual({ patch: {}, caption: { kind: "warn", key: "cargoNoMatch" } });
  });

  test("a match on an empty cargo_description fills it and marks it recognised", () => {
    expect(buildCargoRecognitionVM("大连到群山4400吨饲料，6月7号前ETA", null)).toEqual({
      patch: { cargo_description: "饲料" },
      caption: { kind: "ok", key: "cargoRecognised", params: { cargo: "饲料" } },
    });
  });

  test("cargo_description is only whitespace -> treated as empty, still fills", () => {
    expect(buildCargoRecognitionVM("散装硫酸铵", "   ")).toEqual({
      patch: { cargo_description: "硫酸铵" },
      caption: { kind: "ok", key: "cargoRecognised", params: { cargo: "硫酸铵" } },
    });
  });

  test("a match that agrees with the existing value does nothing — no patch, no caption", () => {
    expect(buildCargoRecognitionVM("散装硫酸铵", "硫酸铵")).toEqual({ patch: {}, caption: null });
  });

  test("no match, field already has a value -> kept, not silent (found 2026-09-23: a leftover value from an earlier enquiry must say so)", () => {
    expect(buildCargoRecognitionVM("这段话里完全没有提到任何货物名称", "氯化钙")).toEqual({
      patch: {},
      caption: { kind: "warn", key: "cargoKept", params: { cargo: "氯化钙" } },
    });
  });

  test("a differing match on a non-empty field is offered, never applied automatically (found 2026-09-22)", () => {
    expect(buildCargoRecognitionVM("大连到和歌山 8月底2000吨硅铁", "氯化钙")).toEqual({
      patch: {},
      caption: { kind: "offer", key: "cargoOffer", params: { cargo: "硅铁", current: "氯化钙" } },
      offerValue: "硅铁",
    });
  });

  test("the offer works the same regardless of how the current value got there — confirmed, hand-typed, or a reloaded draft all look identical here", () => {
    // this is the whole point of the stateless rule: there is no third argument to distinguish them any more
    expect(buildCargoRecognitionVM("大连到和歌山 8月底2000吨硅铁", "Something the operator typed by hand")).toEqual({
      patch: {},
      caption: { kind: "offer", key: "cargoOffer", params: { cargo: "硅铁", current: "Something the operator typed by hand" } },
      offerValue: "硅铁",
    });
  });
});
