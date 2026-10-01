import { DWT_TIERS } from "../workspace/fieldGroups";

// Vessel-type DWT bands for dashboards 2 and 3 (design_backend.md §24, client-confirmed
// 2026-09-23): the client's own existing DWT_TIERS, plus two open-ended bands at the
// edges ("< 2000", "> 20000") the client explicitly asked not to be forgotten — 12 bands
// total, not just the 11 listed tier values. Bucketing happens here (client-side) rather
// than duplicating DWT_TIERS as a second list in Python, so there is exactly one place
// the band boundaries live.

export const DWT_BAND_LABELS: string[] = [
  `< ${DWT_TIERS[0]}`,
  ...DWT_TIERS.slice(0, -1).map((lo, i) => `${lo}–${DWT_TIERS[i + 1]}`),
  `> ${DWT_TIERS[DWT_TIERS.length - 1]}`,
];

/** Group key for quotes with no vessel DWT on record (`null`/`0`/negative — e.g. T2.34's historical
 * cases whose title names no tonnage, §23). [AMENDMENT 2026-09-24, client] They used to be counted
 * in "< 2000", which made that band inaccurate; they now form their own group, shown as
 * "Unknown" / "未知" by the page (i18n `dashboards.unknownDwt`), kept out of the real bands. */
export const DWT_UNKNOWN = "unknown";

export function dwtBandLabel(dwt: number | null | undefined): string {
  const v = dwt ?? 0;
  if (v <= 0) return DWT_UNKNOWN;
  for (let i = 0; i < DWT_TIERS.length; i++) {
    if (v < DWT_TIERS[i]) return DWT_BAND_LABELS[i];
  }
  return DWT_BAND_LABELS[DWT_BAND_LABELS.length - 1];
}

// One muted colour per band (dashboard 2, client request 2026-09-23: distinct per band,
// but "same family" as dashboard 1's teal/amber — no bright/saturated hues). Indexed by
// DWT_BAND_LABELS' position, cycling if there are ever more bands than colours.
const BAND_PALETTE = [
  "#1F7A6C", // teal — dashboard 1's VLSFO
  "#D97706", // amber — dashboard 1's LSMGO
  "#34568B", // slate blue
  "#C97064", // terracotta
  "#6B8E23", // olive
  "#8B5A2B", // rust brown
  "#4E5BA6", // indigo
  "#B08968", // tan
  "#556B7D", // steel grey-blue
  "#A0522D", // sienna
  "#5F7470", // sage grey
  "#9C6644", // warm brown
];

export function dwtBandColor(label: string): string {
  if (label === DWT_UNKNOWN) return "#8C8C8C"; // neutral grey: not a vessel type
  const i = DWT_BAND_LABELS.indexOf(label);
  return BAND_PALETTE[(i < 0 ? 0 : i) % BAND_PALETTE.length];
}
