import { createContext, useContext } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import type { DraftLatest, PrecisionMode, QuoteCalculationResult, QuoteInput } from "../api/types";
import type { QuoteFormValues } from "../form/fields";
import type { CalcState } from "../state/calcMachine";
import type { FormEvent, FormLifecycleState, LoadPayload } from "../state/formMachine";
import type { SaveEvent, SaveState } from "../state/saveMachine";
import type { BunkerAutofillVM } from "../vm/types";
import type { DistanceCaption } from "../vm/distance";
import type { RecognitionCaption } from "./useFieldRecognition";
import type { LaycanRange } from "../vm/laycan";

export type Values = QuoteFormValues;

export interface WorkspaceValue {
  values: Values;
  setField: <K extends keyof Values>(field: K, value: Values[K]) => void;

  lifecycle: FormLifecycleState<Values>;
  dispatchLifecycle: (event: FormEvent<Values>) => void;
  requestLoad: (payload: LoadPayload<Values>) => void;
  confirmReplace: () => void;
  cancelReplace: () => void;

  calc: CalcState;
  /** The request body of the last Run while its result is still current, else null. */
  calcBody: QuoteInput | null;
  /** The precision chosen for the next Run, and the one the shown result was calculated with. */
  precisionMode: PrecisionMode;
  runPrecision: PrecisionMode;
  setPrecisionMode: (mode: PrecisionMode) => void;
  /** Run (航次测算): the only thing that starts a calculation. */
  run: () => void;
  /** New quote: blank inputs, no result, clean form. The caller has already asked the operator when there were unsaved edits. */
  clearAll: () => void;
  calcQuery: UseQueryResult<QuoteCalculationResult>;
  /** What the verdict panel shows: the current request's result, or the last good one while it is stale / errored (greyed). */
  verdictData: QuoteCalculationResult | undefined;

  save: SaveState;
  dispatchSave: (event: SaveEvent) => void;
  /** Save Quote: only after a Run of the current inputs (calc READY); the body and precision are those of that Run. */
  saveQuote: () => void;
  /** Save Draft: any time, even with an incomplete form. */
  saveDraft: () => void;
  /** A note about the record just loaded (an estimated PDA split); null when there is none or it was dismissed. */
  loadNotice: "pdaSplitEstimated" | null;
  dismissLoadNotice: () => void;
  /** GET /drafts/latest, fetched once when the workspace opens; the banner offers it. */
  latestDraft: DraftLatest | undefined;

  routes: string[];
  customPorts: string[];
  bunkerCaption: BunkerAutofillVM["caption"];
  ballastCaption: DistanceCaption | null;
  ladenCaption: DistanceCaption | null;
  cargoCaption: RecognitionCaption | null;
  cargoOffer: string | null;
  termsCaption: RecognitionCaption | null;
  termsOffer: string | null;
  portsCaption: RecognitionCaption | null;
  quantityCaption: RecognitionCaption | null;
  quantityOffer: number | null;
  laycanCaption: RecognitionCaption | null;
  laycanOffer: LaycanRange | null;
  recogniseFields: () => void;
  dismissCargoCaption: () => void;
  dismissTermsCaption: () => void;
  dismissQuantityCaption: () => void;
  dismissLaycanCaption: () => void;
  acceptCargoOffer: () => void;
  acceptTermsOffer: () => void;
  acceptPortsOffer: () => void;
  acceptQuantityOffer: () => void;
  acceptLaycanOffer: () => void;
}

export const WorkspaceContext = createContext<WorkspaceValue | null>(null);

// What the input fields need. Kept apart from the calculation / save state so that a Run, a result arriving or a save
// finishing does not re-render every field of the form.
export interface FormValue {
  values: Values;
  setField: WorkspaceValue["setField"];
  routes: string[];
  customPorts: string[];
  bunkerCaption: BunkerAutofillVM["caption"];
  ballastCaption: DistanceCaption | null;
  ladenCaption: DistanceCaption | null;
  cargoCaption: RecognitionCaption | null;
  cargoOffer: string | null;
  termsCaption: RecognitionCaption | null;
  termsOffer: string | null;
  portsCaption: RecognitionCaption | null;
  quantityCaption: RecognitionCaption | null;
  quantityOffer: number | null;
  laycanCaption: RecognitionCaption | null;
  laycanOffer: LaycanRange | null;
  recogniseFields: () => void;
  dismissCargoCaption: () => void;
  dismissTermsCaption: () => void;
  dismissQuantityCaption: () => void;
  dismissLaycanCaption: () => void;
  acceptCargoOffer: () => void;
  acceptTermsOffer: () => void;
  acceptPortsOffer: () => void;
  acceptQuantityOffer: () => void;
  acceptLaycanOffer: () => void;
}
export const FormContext = createContext<FormValue | null>(null);

export function useFormContext(): FormValue {
  const ctx = useContext(FormContext);
  if (!ctx) throw new Error("useFormContext must be used inside <WorkspaceProvider>");
  return ctx;
}

export function useWorkspace(): WorkspaceValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return ctx;
}
