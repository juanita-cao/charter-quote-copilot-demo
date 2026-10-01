import { matchPorts } from "../config/portMatch";
import { proposeRoute } from "../config/routeParse";
import type { VoyagePort } from "../api/types";
import type { QuoteFormValues } from "../form/fields";
import { buildFieldRecognitionVM, type FieldCaption } from "./fieldRecognition";

// Port recognition, PT-18 third slice — Node 3 of the DEP breakdown (design_backend.md §20): turn Node 1's
// candidates and Node 2's (possibly absent) order into a `voyage_ports` proposal. A thin wrapper around
// `fieldRecognition.ts`'s shared engine, same as cargo/terms — see that file's docstring for the decision itself.
// The one thing ports still does for itself: a "recognised" fill can mean two different things (a confident
// load/discharge order, or an unordered set of candidates), so `buildCaption` below inspects the value to pick the
// right one — everything else (fill/offer/kept/noMatch, comparing lists by content) is the same engine as cargo/terms.
//
// Safety note (unchanged): even an "unconfident order" fill only ever contains untagged `waypoint` rows, never a
// guessed load/discharge — an untagged row contributes to no ballast/laden chain at all (form/voyagePorts.ts
// requires a tagged load/discharge row before any leg is chained), so it carries no risk of a wrong distance
// calculation; it only saves the operator re-searching each port name, never decides a role for them.

export interface PortsRecognitionVM {
  patch: Partial<QuoteFormValues>;
  caption: {
    kind: "ok" | "warn" | "offer";
    key: "portsRecognised" | "portsFoundUnordered" | "portsNoMatch" | "portsKept" | "portsOffer";
    params?: Record<string, string>;
  } | null;
  /** Present only when caption.kind === "offer": the sequence "Replace" would write to voyage_ports. */
  offerValue?: VoyagePort[];
}

const ROLE_LABEL: Record<VoyagePort["role"], string> = { load: "Load", discharge: "Discharge", waypoint: "Waypoint" };
const describeSequence = (rows: VoyagePort[]) => rows.map((r) => `${r.port} (${ROLE_LABEL[r.role]})`).join(" → ");

const isEmpty = (rows: VoyagePort[]) => rows.length === 0;
const isEqual = (a: VoyagePort[], b: VoyagePort[]) => JSON.stringify(a) === JSON.stringify(b);

/** Node 1 + Node 2 combined: every candidate port, ordered and role-tagged if Node 2 is confident, else every
 * candidate as an untagged waypoint in the order found. `null` only when Node 1 found nothing at all. */
function proposeSequence(text: string, customPorts: readonly string[]): VoyagePort[] | null {
  const matches = matchPorts(text, customPorts);
  if (matches.length === 0) return null;
  return proposeRoute(text, matches) ?? matches.map((m) => ({ port: m.name, role: "waypoint" as const }));
}

export function buildPortsRecognitionVM(
  enquiryText: string | null,
  currentVoyagePorts: QuoteFormValues["voyage_ports"],
  customPorts: readonly string[],
): PortsRecognitionVM {
  const text = (enquiryText ?? "").trim();
  if (!text) return { patch: {}, caption: null }; // the enquiry-box notice belongs to cargo recognition, not duplicated here

  const proposed = proposeSequence(text, customPorts);
  const result = buildFieldRecognitionVM<VoyagePort[]>(currentVoyagePorts, isEmpty, proposed, isEqual, (outcome, value): FieldCaption => {
    switch (outcome) {
      case "recognised": {
        const load = value.find((r) => r.role === "load");
        const discharge = value.find((r) => r.role === "discharge");
        return load && discharge
          ? { kind: "ok", key: "portsRecognised", params: { load: load.port, discharge: discharge.port } }
          : { kind: "warn", key: "portsFoundUnordered", params: { ports: value.map((r) => r.port).join(", ") } };
      }
      case "kept":
        return { kind: "warn", key: "portsKept", params: { sequence: describeSequence(value) } };
      case "offer":
        return { kind: "offer", key: "portsOffer", params: { sequence: describeSequence(value) } };
      case "noMatch":
        return { kind: "warn", key: "portsNoMatch" };
    }
  });

  return { patch: result.value !== null ? { voyage_ports: result.value } : {}, caption: result.caption as PortsRecognitionVM["caption"], offerValue: result.offerValue };
}
