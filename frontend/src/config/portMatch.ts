import ports from "../data/ports.json";

// Port recognition, PT-18 third slice — Node 1 of the DEP breakdown (design_frontend.md §15): "which standard/custom
// ports are mentioned in this enquiry text, and roughly where." A closed-vocabulary lookup against the same
// authoritative list `cargoPorts.ts` already uses for suggestions — more precise here than open-domain NER, since
// only names on our own list can ever match (no risk of tagging an unrelated place name as a port).
//
// Short names are a real collision risk at this dictionary's size (17,596 entries): 138 UN/LOCODE names are 3
// characters or fewer (e.g. "Rye", "Med", "Par") and would match constantly inside ordinary English prose. ASCII
// forms below MIN_ASCII_LENGTH are skipped entirely; the ones kept still require a word boundary. Chinese/mixed
// forms are far less collision-prone at this length (city names carry real meaning) and are matched as plain
// substrings, the same convention `cargoMatch.ts`/`cargoPorts.ts` already use.

interface PortEntry {
  locode: string;
  name: string;
  aliases?: string[];
}

const STANDARD_PORTS = ports as PortEntry[];
const MIN_ASCII_LENGTH = 4;
const MATCH_LIMIT = 12; // mirrors voyage_ports' own row cap — a longer list is not a usable proposal anyway

function isAscii(form: string): boolean {
  return /^[\x00-\x7f]+$/.test(form);
}

function escapeRegExp(form: string): string {
  return form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findIndex(text: string, form: string): number {
  if (isAscii(form)) {
    if (form.length < MIN_ASCII_LENGTH) return -1;
    const match = new RegExp(`\\b${escapeRegExp(form)}\\b`, "i").exec(text);
    return match ? match.index : -1;
  }
  return text.indexOf(form);
}

export interface PortMatch {
  /** The standard/custom port's canonical name — never the alias or LOCODE that happened to match. */
  name: string;
  /** Earliest character index the port (by any of its surface forms) was found at, for ordering candidates. */
  index: number;
}

export function matchPorts(text: string, customPorts: readonly string[]): PortMatch[] {
  const earliest = new Map<string, number>();
  const consider = (canonical: string, form: string) => {
    const idx = findIndex(text, form);
    if (idx === -1) return;
    const current = earliest.get(canonical);
    if (current === undefined || idx < current) earliest.set(canonical, idx);
  };

  for (const port of STANDARD_PORTS) {
    consider(port.name, port.name);
    port.aliases?.forEach((alias) => consider(port.name, alias));
  }
  for (const name of customPorts) consider(name, name);

  return [...earliest.entries()]
    .map(([name, index]) => ({ name, index }))
    .sort((a, b) => a.index - b.index)
    .slice(0, MATCH_LIMIT);
}
