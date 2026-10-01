import { describe, expect, test } from "vitest";
import { matchLaycan } from "./laycanMatch";

const FILL_IN = "2026-09-23";

describe("matchLaycan", () => {
  test("an ISO date range is parsed directly", () => {
    expect(matchLaycan("受载期Laycan：2026-04-30 到 2026-05-05", FILL_IN)).toEqual({
      kind: "range",
      start: "2026-04-30",
      end: "2026-05-05",
    });
  });

  test("day range + month + year (English, ordinal suffixes)", () => {
    expect(matchLaycan("LAYCAN: 5-10TH, APR, 2025", FILL_IN)).toEqual({ kind: "range", start: "2025-04-05", end: "2025-04-10" });
  });

  test("month + day range, no year -> infers year from fill-in date", () => {
    expect(matchLaycan("Laycan 20-25 Jun", FILL_IN)).toEqual({ kind: "range", start: "2027-06-20", end: "2027-06-25" });
  });

  test("month earlier than fill-in month rolls forward a year", () => {
    // fill-in is September 2026; "Jun" (June) is earlier in the calendar -> next year, not this one
    expect(matchLaycan("Laycan : May 22-24", FILL_IN)).toEqual({ kind: "range", start: "2027-05-22", end: "2027-05-24" });
  });

  test("cross-month numeric range with dots", () => {
    // fill-in date is in the same month as the laycan's start, so no year-rollover ambiguity to worry about here
    expect(matchLaycan("绥化 装期7.31-8.3", "2026-07-01")).toEqual({ kind: "range", start: "2026-07-31", end: "2026-08-03" });
  });

  test("Chinese single-month range with 号/日", () => {
    expect(matchLaycan("受载期 15-18 号", FILL_IN)).toBeNull(); // no month at all — genuinely ambiguous, not guessed
    expect(matchLaycan("8月20-30，装1卸1", "2026-08-01")).toEqual({ kind: "range", start: "2026-08-20", end: "2026-08-30" });
  });

  test("a fuzzy phrase is reported, never resolved to exact days (client decision 2026-09-23)", () => {
    expect(matchLaycan("受载期:七月下旬", FILL_IN)).toEqual({ kind: "fuzzy", text: "下旬" });
    expect(matchLaycan("LAYCAN: END OF MAY，2024", FILL_IN)).toEqual({ kind: "fuzzy", text: "END OF" });
    expect(matchLaycan("LAYCAN: MID-END OF SEPT (TRY VSL DATE)", FILL_IN)).toBeNull(); // TRY VSL DATE wins — not a real date at all
    expect(matchLaycan("LAYCAN：AROUND 20TH SEPT", FILL_IN)).toEqual({ kind: "fuzzy", text: "AROUND" });
  });

  test("'TRY VESSEL DATE' and its abbreviations are not real dates, never parsed", () => {
    expect(matchLaycan("LAYCAN:TRY VESSEL DATE", FILL_IN)).toBeNull();
    expect(matchLaycan("(TRY VSL DATE)", FILL_IN)).toBeNull();
    expect(matchLaycan("9月份随船期", FILL_IN)).toBeNull();
  });

  test("month repeated on both ends (real sample shape)", () => {
    expect(matchLaycan("SHIBUSHI | LAYCAN: APR 11th – APR 20TH 2025", FILL_IN)).toEqual({
      kind: "range",
      start: "2025-04-11",
      end: "2025-04-20",
    });
  });

  test("day range first, comma before month, no year (real sample shape)", () => {
    expect(matchLaycan("LAYCAN: 20TH-30TH, NOV", "2026-10-01")).toEqual({ kind: "range", start: "2026-11-20", end: "2026-11-30" });
  });

  test("a stowage factor ('SF1.8-2.2') is never mistaken for a cross-month date, even though it has the same shape (found scanning real data)", () => {
    expect(matchLaycan("货物：5000吨木片，SF1.8-2.2 | 装港：海参崴 | 卸港：日照", FILL_IN)).toBeNull();
    expect(matchLaycan("KAWASAKI/FUNBASHI 8000+-5% SF1.9-2.0 CQD/1000SHINC", FILL_IN)).toBeNull();
  });

  test("no laycan-shaped text at all returns null", () => {
    expect(matchLaycan("装港：珠海\n卸港：厦门", FILL_IN)).toBeNull();
  });

  test("empty text returns null", () => {
    expect(matchLaycan("", FILL_IN)).toBeNull();
  });
});
