import type { DeleteReport } from "../state/historyMachine";

export function partitionTargets(keys: string[]): { quoteIds: number[]; draftIds: number[] } {
  const quoteIds: number[] = [];
  const draftIds: number[] = [];
  for (const key of keys) {
    const m = /^([qd])(\d+)$/.exec(key);
    if (!m) throw new Error(`Malformed history key: ${key}`);
    (m[1] === "q" ? quoteIds : draftIds).push(Number(m[2]));
  }
  return { quoteIds, draftIds };
}

export interface DeletePart {
  requested: number;
  deleted: number;
  ok: boolean;
}

export type DeleteOutcome =
  | { outcome: "allSucceeded"; report: DeleteReport }
  | { outcome: "someFailed"; report: DeleteReport }
  | { outcome: "allFailed"; report: DeleteReport };

export function classifyDelete(parts: { quotes: DeletePart; drafts: DeletePart }): DeleteOutcome {
  const failed: DeleteReport["failed"] = [];
  if (parts.quotes.requested > 0 && !parts.quotes.ok) failed.push("quotes");
  if (parts.drafts.requested > 0 && !parts.drafts.ok) failed.push("drafts");
  const requestedParts = Number(parts.quotes.requested > 0) + Number(parts.drafts.requested > 0);
  const report: DeleteReport = {
    quotesDeleted: parts.quotes.ok ? parts.quotes.deleted : 0,
    draftsDeleted: parts.drafts.ok ? parts.drafts.deleted : 0,
    failed,
  };
  if (failed.length === 0) return { outcome: "allSucceeded", report };
  return { outcome: failed.length === requestedParts ? "allFailed" : "someFailed", report };
}
