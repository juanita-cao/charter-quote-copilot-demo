// Quantity recognition, PT-18 fourth slice (design_backend.md §20-style DEP breakdown). Real data measured before
// writing this (466 unique enquiry texts): 57.7% mention a number immediately followed by 吨/MT/mts; of texts that
// mention one at all, ~70% have exactly one such candidate (safe to take as-is) and the rest have several (loading
// rates, per-unit/packaging weights, prices, dimensions) — sampling showed the *first* one in the text is almost
// always the real deal quantity, the later ones are usually something else, so this takes the earliest match rather
// than trying to classify every number in the text.
//
// Ranges ("7000-8000吨") are common enough (9.4% of all texts) to detect on purpose rather than let the regex
// silently pick one end — client decision 2026-09-23: never resolve a range to a single number automatically, only
// report that one was found (form/quantity.ts, not this file, decides what to do with that).

export type QuantityMatch = { kind: "single"; value: number } | { kind: "range"; min: number; max: number };

// "吨" gets no trailing \b — JS's \b only recognises ASCII word characters, so a boundary check right after a CJK
// character fails whenever what follows is also non-ASCII (e.g. "4400吨饲料" — neither "吨" nor "饲" is a \w char,
// so there is no transition for \b to match at all). The English forms still need \b so "MT"/"mt" don't match
// inside a longer word; that risk doesn't exist for "吨" (same reasoning as cargoMatch.ts/portMatch.ts).
const NUM = String.raw`\d[\d,]*\.?\d*`;
const UNIT = String.raw`(?:吨|MT\b|mts?\b)`;
const RANGE_PATTERN = new RegExp(String.raw`(${NUM})\s*[-—~/]\s*(${NUM})\s*(万)?\s*${UNIT}`, "i");
const SINGLE_PATTERN = new RegExp(String.raw`(${NUM})\s*(万)?\s*${UNIT}`, "i");

function parseNumber(raw: string, hasWan: boolean): number {
  const n = parseFloat(raw.replace(/,/g, ""));
  return hasWan ? n * 10000 : n;
}

export function matchQuantity(text: string): QuantityMatch | null {
  const range = RANGE_PATTERN.exec(text);
  const single = SINGLE_PATTERN.exec(text);

  if (range && (!single || range.index <= single.index)) {
    return { kind: "range", min: parseNumber(range[1], !!range[3]), max: parseNumber(range[2], !!range[3]) };
  }
  if (single) return { kind: "single", value: parseNumber(single[1], !!single[2]) };
  return null;
}
