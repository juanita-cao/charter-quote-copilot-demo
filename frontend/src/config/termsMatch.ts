import { CONTRACT_TERMS } from "../workspace/fieldGroups";

// Contract-terms recognition (CONTRACT_TERMS is already the form's own fixed option list, not vocabulary
// gathered from free text). FICO and LIFO are kept in the matcher regardless of how often they show up in real
// enquiry text, since they are standard charter-party terms already offered as form options.

function escapeRegExp(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function matchTerms(text: string): string | null {
  for (const term of CONTRACT_TERMS) {
    if (new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(text)) return term;
  }
  return null;
}
