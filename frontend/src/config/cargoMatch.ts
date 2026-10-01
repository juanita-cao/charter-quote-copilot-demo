import cargo from "../data/cargo.json";

// Cargo recognition. `cargo.json` is a dictionary of bulk-cargo concepts, each with the surface forms (Chinese
// and/or English) it is actually written as in real freight enquiries, not invented translations. A match
// proposes filling the free-text `cargo_description` field; it never creates a new structured field.

interface CargoEntry {
  concept: string;
  forms: string[];
}

const CARGO_DICTIONARY = cargo as CargoEntry[];

function isAscii(form: string): boolean {
  return /^[\x00-\x7f]+$/.test(form);
}

function escapeRegExp(form: string): string {
  return form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function matchCargo(text: string): string | null {
  for (const entry of CARGO_DICTIONARY) {
    for (const form of entry.forms) {
      if (isAscii(form)) {
        if (new RegExp(`\\b${escapeRegExp(form)}\\b`, "i").test(text)) return entry.concept;
      } else if (text.includes(form)) {
        return entry.concept;
      }
    }
  }
  return null;
}

/** English label for a matched concept, for the English UI (dashboards.ts, T2.35 §24) —
 * the concept itself is Chinese by convention (design_backend.md §18: recorded only in the
 * language it was actually verified in, never a paired bilingual invention). Returns the
 * concept's own first verified ASCII form when one exists (e.g. "镍铁" -> "Ferro-nickel");
 * `null` when the concept has no real English form on file — the caller falls back to the
 * Chinese concept rather than inventing one, same discipline as the dictionary build itself. */
export function englishFormFor(concept: string): string | null {
  const entry = CARGO_DICTIONARY.find((e) => e.concept === concept);
  return entry?.forms.find(isAscii) ?? null;
}
