// The server refuses an export of more than this many records (POST /export, design_backend.md §8).
export const MAX_EXPORT_RECORDS = 100;

export type ExportSelectionState = "EMPTY" | "OK" | "TOO_MANY";

export function exportSelectionState(selection: string[]): ExportSelectionState {
  if (selection.length === 0) return "EMPTY";
  return selection.length > MAX_EXPORT_RECORDS ? "TOO_MANY" : "OK";
}
