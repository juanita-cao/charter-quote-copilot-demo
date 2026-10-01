import type { VoyagePort } from "../api/types";

// The voyage port sequence (v1.2, design_frontend.md §12, PT-21): a single ordered list, each row tagged
// load / discharge / waypoint. load_port and discharge_port are derived from it; ballast_distance sums the legs
// before the load row plus the legs from the discharge row onward (both are "empty ship" legs); laden_distance
// sums the legs from the load row to the discharge row (the "loaded" leg, possibly with stops in between).

export function loadPortOf(rows: VoyagePort[]): string | null {
  const port = rows.find((r) => r.role === "load")?.port.trim();
  return port ? port : null;
}

export function dischargePortOf(rows: VoyagePort[]): string | null {
  const port = rows.find((r) => r.role === "discharge")?.port.trim();
  return port ? port : null;
}

// A window of the sequence, or [] if the window's role marker is missing or any port in it is still blank (an
// incomplete window is never partially chained — that would connect two ports that are not really adjacent).
function window(rows: VoyagePort[], from: number, to: number): string[] {
  if (from < 0 || to < 0 || to < from) return [];
  const chain = rows.slice(from, to + 1).map((r) => r.port.trim());
  return chain.every((p) => p !== "") ? chain : [];
}

export type VoyagePortsError = "duplicateLoad" | "duplicateDischarge" | "dischargeBeforeLoad";

export function validateVoyagePorts(rows: VoyagePort[]): VoyagePortsError | null {
  if (rows.filter((r) => r.role === "load").length > 1) return "duplicateLoad";
  if (rows.filter((r) => r.role === "discharge").length > 1) return "duplicateDischarge";
  const li = rows.findIndex((r) => r.role === "load");
  const di = rows.findIndex((r) => r.role === "discharge");
  if (li >= 0 && di >= 0 && di <= li) return "dischargeBeforeLoad";
  return null;
}

/** Ports before and including the load row: the ballast-in leg(s). [] if there is no load row yet, or the sequence
 * is invalid (a duplicate tag, or Discharge before Load) — an invalid sequence is never partially chained, which is
 * what let preLoadChain and postDischargeChain both grab the same rows and double-count one leg (found 2026-09-22). */
export function preLoadChain(rows: VoyagePort[]): string[] {
  if (validateVoyagePorts(rows) !== null) return [];
  return window(rows, 0, rows.findIndex((r) => r.role === "load"));
}

/** The discharge row and everything after it: the ballast-out leg(s), usually just the one port (nothing to chain). */
export function postDischargeChain(rows: VoyagePort[]): string[] {
  if (validateVoyagePorts(rows) !== null) return [];
  const i = rows.findIndex((r) => r.role === "discharge");
  return i < 0 ? [] : window(rows, i, rows.length - 1);
}

/** The load row through the discharge row: the laden leg(s). [] if either tag is missing, out of order, or the
 * sequence is otherwise invalid. */
export function ladenChain(rows: VoyagePort[]): string[] {
  if (validateVoyagePorts(rows) !== null) return [];
  const li = rows.findIndex((r) => r.role === "load");
  const di = rows.findIndex((r) => r.role === "discharge");
  if (li < 0 || di < 0 || di <= li) return [];
  return window(rows, li, di);
}
