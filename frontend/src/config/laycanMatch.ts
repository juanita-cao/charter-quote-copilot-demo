// Laycan recognition, PT-18 sixth slice. Real data (466 unique enquiry texts) showed far more format diversity
// than any other field: ISO dates, English "5-10TH, APR, 2025" / "APR 11th – APR 20TH 2025" / "May 22-24", Chinese
// "8月20-30" / "7.31-8.3" (cross-month, dot-separated), fuzzy phrases with no exact days at all (下旬/月初/月底,
// "END OF"/"MID-END OF"/"AROUND"), and outright non-commitments ("LAYCAN: TRY VESSEL DATE" — the vessel date isn't
// fixed yet, not a real laycan). Client decisions 2026-09-23: a fuzzy phrase is reported, never resolved to exact
// days (same "don't invent a business rule for what 下旬 means in days" call as quantity's range handling); a
// missing year is inferred from the enquiry's own fill-in date, rolling forward a year if the recognised month is
// earlier than the fill-in month (a laycan is always upcoming, never in the past).

export type LaycanMatch =
  | { kind: "range"; start: string; end: string } // ISO dates, "YYYY-MM-DD"
  | { kind: "fuzzy"; text: string }; // a laycan-shaped mention with no exact, resolvable days

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const MONTH_EN = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");
const DAY = String.raw`\d{1,2}(?:st|nd|rd|th)?`;

const NOT_A_REAL_DATE = /try\s*(?:vessel|vsl)\s*date|随船期|船期(?:再)?定|待定/i;
const FUZZY_KEYWORDS = /下旬|中旬|上旬|月初|月底|月中|end\s+of|mid[- ]?end|around/i;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** The enquiry's own fill-in date decides the year for a laycan that doesn't state one — a laycan is always
 * upcoming, so a month earlier than the fill-in month means next year, not this year. */
function inferYear(month: number, fillInDate: string): number {
  const fillYear = Number(fillInDate.slice(0, 4));
  const fillMonth = Number(fillInDate.slice(5, 7));
  return month < fillMonth ? fillYear + 1 : fillYear;
}

function isoRange(y1: number, m1: number, d1: number, y2: number, m2: number, d2: number): LaycanMatch {
  return { kind: "range", start: `${y1}-${pad(m1)}-${pad(d1)}`, end: `${y2}-${pad(m2)}-${pad(d2)}` };
}

export function matchLaycan(text: string, fillInDate: string): LaycanMatch | null {
  if (NOT_A_REAL_DATE.test(text)) return null;

  // 1. ISO date range: "2026-04-30 到 2026-05-05" / "2026-04-30 - 2026-05-05"
  const iso = /(\d{4})-(\d{2})-(\d{2})\s*(?:到|[-~])\s*(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return isoRange(+iso[1], +iso[2], +iso[3], +iso[4], +iso[5], +iso[6]);

  // 2. Cross-month numeric, dot-separated: "7.31-8.3". Excludes a stowage factor immediately before it ("SF1.8-2.2")
  // — found scanning real data: SF is always written "N.N-N.N" too, and collides with this pattern exactly; day and
  // month bounds alone don't catch every case (e.g. "SF1.8-2.2" has a valid-looking month 1/2 and day 8/2).
  const crossMonthDot = /(?<!sf\s{0,3})(\d{1,2})\.(\d{1,2})\s*[-~]\s*(\d{1,2})\.(\d{1,2})/i.exec(text);
  if (crossMonthDot) {
    const [, m1, d1, m2, d2] = crossMonthDot.map(Number) as unknown as number[];
    if (m1 >= 1 && m1 <= 12 && d1 >= 1 && d1 <= 31 && m2 >= 1 && m2 <= 12 && d2 >= 1 && d2 <= 31) {
      const y1 = inferYear(m1, fillInDate);
      return isoRange(y1, m1, d1, m2 < m1 ? y1 + 1 : y1, m2, d2);
    }
  }
  const crossMonthCn = /(\d{1,2})月(\d{1,2})[日号]\s*[-~到]\s*(\d{1,2})月(\d{1,2})[日号]/.exec(text);
  if (crossMonthCn) {
    const [, m1, d1, m2, d2] = crossMonthCn.map(Number) as unknown as number[];
    const y1 = inferYear(m1, fillInDate);
    return isoRange(y1, m1, d1, m2 < m1 ? y1 + 1 : y1, m2, d2);
  }

  // 3. Chinese single-month range: "8月20-30", "受载期:七月下旬" is NOT this (no digits) — falls through to fuzzy below
  const cnSingleMonth = /(\d{1,2})月(\d{1,2})\s*[-~]\s*(\d{1,2})[日号]?/.exec(text);
  if (cnSingleMonth) {
    const [, m, d1, d2] = cnSingleMonth.map(Number) as unknown as number[];
    const y = inferYear(m, fillInDate);
    return isoRange(y, m, d1, y, m, d2);
  }

  // 4. English, two non-overlapping shapes so there is never ambiguity about which number is a day and which a
  //    year (the earlier combined attempt at this had exactly that ambiguity — found while testing against real
  //    samples, e.g. "AROUND 20TH SEPT" was mis-read as a confident date instead of falling through to fuzzy):
  //    (a) month first — "MON D(-D)?(, YYYY)?", also covers "APR 11th – APR 20TH 2025" (month repeated on both
  //        ends) via the optional month prefix before the second day
  //    (b) day(s) first — "D-D, MON(, YYYY)?" / "D-D MON" (comma optional, but whitespace before the month is not)
  const monthFirst = new RegExp(
    String.raw`\b(?<mon>${MONTH_EN})\.?\s+(?<d1>${DAY})(?:\s*[-–~]\s*(?:(?:${MONTH_EN})\.?\s+)?(?<d2>${DAY}))?\s*,?\s*(?<year>\d{4})?`,
    "i",
  ).exec(text);
  const dayFirst = new RegExp(
    String.raw`\b(?<d1>${DAY})\s*[-–~]\s*(?<d2>${DAY}),?\s+(?<mon>${MONTH_EN})\.?\s*,?\s*(?<year>\d{4})?`,
    "i",
  ).exec(text);

  const enMatch = monthFirst ?? dayFirst;
  if (enMatch?.groups) {
    const { mon, d1, d2, year } = enMatch.groups;
    const month = MONTHS[mon.toLowerCase()];
    const resolvedYear = year ? Number(year) : inferYear(month, fillInDate);
    const day1 = parseInt(d1, 10);
    const day2 = d2 ? parseInt(d2, 10) : day1;
    return isoRange(resolvedYear, month, day1, resolvedYear, month, day2);
  }

  const fuzzyMatch = FUZZY_KEYWORDS.exec(text);
  if (fuzzyMatch) return { kind: "fuzzy", text: fuzzyMatch[0] };

  return null;
}
