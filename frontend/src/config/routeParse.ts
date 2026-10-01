import type { PortMatch } from "./portMatch";
import type { VoyagePortRole } from "../api/types";

// Port recognition, PT-18 third slice — Node 2 of the DEP breakdown (design_backend.md §20): given the candidate
// ports Node 1 (portMatch.ts) already found, decide load/discharge order where the text makes it clear, and say so
// plainly (return null) otherwise. Rule-based, not a model — measured against real data (design_backend.md §20)
// before choosing: a small cascade of separator patterns already covers ≥91.6% of real enquiry text, which did not
// justify a local model for this step either.
//
// Deliberately conservative: an incorrect load/discharge guess would silently corrupt ballast/laden distance and
// the whole downstream calculation (unlike a wrong cargo/terms guess, which is only ever cosmetic) — a mis-ordered
// route is a worse failure than no order at all, so this only ever returns an order it found real textual evidence
// for, never a best-effort guess among ambiguous candidates.

export interface RoutePort {
  port: string;
  role: VoyagePortRole;
}

const LOAD_LABELS = [/装港/, /起运港/, /\bL\/?P\s*[:：]/i, /\bPOL\s*[:：]/i, /loading\s*port/i, /\bload\s*port/i];
const DISCHARGE_LABELS = [/卸港/, /目的港/, /\bD\/?P\s*[:：]/i, /\bPOD\s*[:：]/i, /discharge\s*port/i, /unloading\s*port/i];
// Any of these appearing textually between two port mentions is read as "the first leads to the second" — the
// separator's own meaning doesn't need to be more specific than that for a two-port case.
const BETWEEN_SEPARATOR = /[到至去]|[-—~]{1,2}|\/|\bto\b|\bex\b/i;
const MAX_LABEL_TO_PORT_DISTANCE = 40; // characters — a label should be immediately followed by its port, not any later mention

function earliestLabelEnd(text: string, labels: RegExp[]): number | null {
  let earliest: number | null = null;
  for (const label of labels) {
    const match = label.exec(text);
    if (!match) continue;
    const end = match.index + match[0].length;
    if (earliest === null || end < earliest) earliest = end;
  }
  return earliest;
}

function nearestPortAfter(matches: PortMatch[], afterIndex: number): PortMatch | null {
  let best: PortMatch | null = null;
  for (const m of matches) {
    if (m.index < afterIndex) continue;
    if (m.index - afterIndex > MAX_LABEL_TO_PORT_DISTANCE) continue;
    if (!best || m.index < best.index) best = m;
  }
  return best;
}

/** Ordered [load, discharge] if the text gives real evidence for the order, else null (no guess). */
export function proposeRoute(text: string, matches: PortMatch[]): RoutePort[] | null {
  if (matches.length < 2) return null;

  const loadLabelEnd = earliestLabelEnd(text, LOAD_LABELS);
  const dischargeLabelEnd = earliestLabelEnd(text, DISCHARGE_LABELS);
  if (loadLabelEnd !== null && dischargeLabelEnd !== null) {
    const loadPort = nearestPortAfter(matches, loadLabelEnd);
    const dischargePort = nearestPortAfter(matches, dischargeLabelEnd);
    if (loadPort && dischargePort && loadPort.name !== dischargePort.name) {
      return [
        { port: loadPort.name, role: "load" },
        { port: dischargePort.name, role: "discharge" },
      ];
    }
  }

  if (matches.length === 2) {
    const [a, b] = matches;
    const between = text.slice(a.index, b.index);
    if (BETWEEN_SEPARATOR.test(between)) {
      return [
        { port: a.name, role: "load" },
        { port: b.name, role: "discharge" },
      ];
    }
  }

  return null;
}
