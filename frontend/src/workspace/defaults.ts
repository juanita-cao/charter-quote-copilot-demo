import type { QuoteFormValues } from "../form/fields";

// The form's starting values. Blank by default; the mock-mode bootstrap in main.tsx (a dev-only, tree-shaken block)
// may install a sample case, so no mock data ever reaches a production bundle through this module.
let defaults: QuoteFormValues | null = null;

export function setWorkspaceDefaults(values: QuoteFormValues | null): void {
  defaults = values;
}

export function getWorkspaceDefaults(): QuoteFormValues | null {
  return defaults;
}
