import type { BunkerPriceResult, VesselConsumptionProfile } from "../api/types";
import { buildBunkerAutofillVM } from "../vm/bunker";
import type { QuoteFormValues } from "./fields";

const CRANE_TIERS = [8000, 9000, 10000];

// Mirrors design_backend.md T2.25: has_crane only matters for these tiers.
const effectiveCrane = (dwt: number, hasCrane: boolean | null): boolean => (CRANE_TIERS.includes(dwt) ? hasCrane === true : false);

export function buildBunkerPrefillPatch(
  req: { port: string },
  current: { bunkering_port: string | null },
  result: BunkerPriceResult | null,
  today: Date,
): Partial<QuoteFormValues> {
  return buildBunkerAutofillVM(req, current, result, today).patch;
}

export function buildVesselPrefillPatch(
  req: { dwt: number; hasCrane: boolean },
  current: { vessel_dwt: number | null; has_crane: boolean | null },
  result: VesselConsumptionProfile | null,
): Partial<QuoteFormValues> {
  if (result === null || current.vessel_dwt !== req.dwt) return {};
  if (effectiveCrane(req.dwt, req.hasCrane) !== effectiveCrane(current.vessel_dwt, current.has_crane)) return {};
  return {
    ballast_speed: result.ballast_speed,
    laden_speed: result.laden_speed,
    hfo_ballast_consumption: result.hfo_ballast_consumption,
    hfo_laden_consumption: result.hfo_laden_consumption,
    mgo_ballast_consumption: result.mgo_ballast_consumption,
    mgo_laden_consumption: result.mgo_laden_consumption,
    hfo_port_consumption: result.hfo_port_consumption,
    mgo_port_consumption: result.mgo_port_consumption,
  };
}
