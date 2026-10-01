import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { ApiError } from "../api/http";
import type { PrecisionMode, QuoteCalculationResult, QuoteInput } from "../api/types";
import { useApi } from "../app/contexts";
import { collectDraftBody, collectForm } from "../form/collect";
import { startingFormValues, todayIso } from "../form/fields";
import { isComplete } from "../form/guard";
import { buildVesselPrefillPatch } from "../form/prefill";
import { dischargePortOf, ladenChain, loadPortOf, postDischargeChain, preLoadChain, validateVoyagePorts } from "../form/voyagePorts";
import { useSaveDraft, useSaveQuote } from "../hooks/mutations";
import { useBunkerPrice, useCalculate, useCompanyRoutes, useCustomPorts, useDistanceChain, useLatestDraft, useVesselConsumption } from "../hooks/queries";
import { calcReducer, initialCalcState } from "../state/calcMachine";
import { formReducer, initialFormState, type FormLifecycleState, type LoadPayload } from "../state/formMachine";
import { initialSaveState, saveReducer } from "../state/saveMachine";
import { buildBunkerAutofillVM } from "../vm/bunker";
import { buildCargoRecognitionVM } from "../vm/cargo";
import { buildTermsRecognitionVM } from "../vm/terms";
import { buildPortsRecognitionVM } from "../vm/ports";
import { buildQuantityRecognitionVM } from "../vm/quantity";
import { buildLaycanRecognitionVM, type LaycanRange } from "../vm/laycan";
import { buildBallastDistanceVM, buildLadenDistanceVM, type DistanceLeg } from "../vm/distance";
import { ReplaceModal } from "./ReplaceModal";
import { FormContext, WorkspaceContext, type FormValue, type Values, type WorkspaceValue } from "./context";
import { getWorkspaceDefaults } from "./defaults";
import { useFieldRecognition } from "./useFieldRecognition";

const EMPTY_ROUTES: string[] = [];
const EMPTY_CUSTOM_PORTS: string[] = [];

// Lives above the router's page components (inside ProtectedLayout), so the form and its dirty flag survive
// Workspace <-> History <-> Guide navigation (decision 7) and reset on logout when the layout unmounts.
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const [values, setValues] = useState<Values>(() => getWorkspaceDefaults() ?? startingFormValues());
  const [lifecycle, dispatchLifecycle] = useReducer(
    formReducer<Values>,
    initialFormState as FormLifecycleState<Values>,
  );
  const [save, dispatchSave] = useReducer(saveReducer, initialSaveState);
  const [calc, dispatchCalc] = useReducer(calcReducer, initialCalcState);

  const lifecycleRef = useRef(lifecycle);
  lifecycleRef.current = lifecycle;
  const calcRef = useRef(calc);
  calcRef.current = calc;
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const saveRef = useRef(save);
  saveRef.current = save;

  // The calculation precision the operator chose for the next Run (client decision, 2026-09-21: display precision
  // by default, full precision on request). Changing it, like any input, makes the shown result stale.
  const [precisionMode, setPrecisionModeState] = useState<PrecisionMode>("display");
  const precisionModeRef = useRef(precisionMode);
  precisionModeRef.current = precisionMode;

  // ── every change of the form values is one of these ──
  const setField = useCallback<WorkspaceValue["setField"]>((field, value) => {
    setValues((v) => ({ ...v, [field]: value }));
    dispatchLifecycle({ type: "userEdited" });
    dispatchSave({ type: "formChanged" });
    dispatchCalc({ type: "formChanged" });
  }, []);

  const applyPatch = useCallback((patch: Partial<Values>) => {
    if (Object.keys(patch).length === 0) return;
    setValues((v) => ({ ...v, ...patch }));
    dispatchLifecycle({ type: "prefillApplied" });
    dispatchSave({ type: "formChanged" });
    dispatchCalc({ type: "formChanged" });
  }, []);

  const [loadNotice, setLoadNotice] = useState<"pdaSplitEstimated" | null>(null);
  const dismissLoadNotice = useCallback(() => setLoadNotice(null), []);
  // A loaded record's own stored figures are the source of truth: the vessel-DWT / bunker-port auto-fills must not
  // overwrite them just because the loaded record carries a DWT / port (found 2026-09-24: backfilling vessel_dwt onto
  // imported history made every load silently swap the saved 8.5 kn laden speed for the DWT table's 9.0). They resume
  // as soon as the operator changes that field to something else.
  const vesselLoaded = useRef<string | null>(null);
  const bunkerLoaded = useRef<string | null>(null);
  const applyLoad = useCallback((payload: LoadPayload<Values>) => {
    vesselLoaded.current = `${payload.values.vessel_dwt}|${payload.values.has_crane === true}`;
    bunkerLoaded.current = payload.values.bunkering_port ?? null;
    setValues(payload.values);
    setLoadNotice(payload.notice ?? null);
    dispatchLifecycle({ type: "loadApplied", source: payload.source });
    dispatchSave({ type: "formChanged" });
    dispatchCalc({ type: "formChanged" });
  }, []);

  // ── M4: overwrite guard (OQ-1) ──
  const requestLoad = useCallback(
    (payload: LoadPayload<Values>) => {
      const lc = lifecycleRef.current;
      if (lc.pendingLoad !== null) return; // the confirm modal is modal
      dispatchLifecycle({ type: "loadRequested", payload });
      if (!lc.dirty) applyLoad(payload);
    },
    [applyLoad],
  );
  const confirmReplace = useCallback(() => {
    const pending = lifecycleRef.current.pendingLoad;
    if (!pending) return;
    dispatchLifecycle({ type: "replaceConfirmed" });
    applyLoad(pending);
  }, [applyLoad]);
  const cancelReplace = useCallback(() => dispatchLifecycle({ type: "replaceCancelled" }), []);

  // ── M2: calculation only when the operator clicks Run (SA-13, client decision 2026-09-21) ──
  // The request body and precision are captured at the click; `seq` ties them to that Run. After any edit the seq no
  // longer matches, so nothing is fetched for the changed inputs until Run is clicked again.
  const [lastRun, setLastRun] = useState<{ seq: number; body: QuoteInput; precision: PrecisionMode } | null>(null);
  const run = useCallback(() => {
    if (calcRef.current.status === "CALCULATING") return; // a duplicate click
    const current = valuesRef.current;
    const complete = isComplete(current);
    dispatchCalc({ type: "runClicked", complete });
    if (complete) setLastRun({ seq: calcRef.current.seq + 1, body: collectForm(current), precision: precisionModeRef.current });
  }, []);
  const setPrecisionMode = useCallback((mode: PrecisionMode) => {
    if (mode === precisionModeRef.current) return;
    setPrecisionModeState(mode);
    dispatchCalc({ type: "formChanged" });
  }, []);

  const lastRunRef = useRef(lastRun);
  lastRunRef.current = lastRun;
  // New quote (client parity with the predecessor's "Reset All"; M4 event F-08): blank inputs, no result on screen.
  const [lastGood, setLastGood] = useState<QuoteCalculationResult | undefined>();
  const clearAll = useCallback(() => {
    setValues(startingFormValues());
    setLoadNotice(null);
    dispatchLifecycle({ type: "formReset" });
    dispatchSave({ type: "formChanged" });
    dispatchCalc({ type: "formCleared" });
    setLastRun(null);
    setLastGood(undefined);
  }, []);

  const body = lastRun !== null && lastRun.seq === calc.seq ? lastRun.body : null;
  const calcQuery = useCalculate(api, calc.seq, body, lastRun?.precision);

  // R1/R2: the query is keyed by the current seq, so a settled query is always the current request's result.
  useEffect(() => {
    if (calc.status !== "CALCULATING" || calcQuery.isPlaceholderData) return;
    if (calcQuery.isSuccess) {
      dispatchCalc({ type: "calcSucceeded", seq: calc.seq });
    } else if (calcQuery.isError) {
      const err = calcQuery.error;
      if (err instanceof ApiError && err.status === 422) dispatchCalc({ type: "calc422", seq: calc.seq, detail: err.message });
      else dispatchCalc({ type: "calcFailed", seq: calc.seq });
    }
  }, [calc.status, calc.seq, calcQuery.status, calcQuery.isPlaceholderData, calcQuery.isSuccess, calcQuery.isError, calcQuery.error]);

  // After an error TanStack Query drops the placeholder, but the design keeps the previous result on screen (greyed).
  useEffect(() => {
    if (calcQuery.isSuccess && !calcQuery.isPlaceholderData) setLastGood(calcQuery.data);
  }, [calcQuery.isSuccess, calcQuery.isPlaceholderData, calcQuery.data]);
  const verdictData = calcQuery.data ?? lastGood;

  // ── M3: saving (SA-20, SA-21). Each click captures the form version and an immutable body; an edit made while the
  // save is in flight neither cancels it nor is lost — M4 compares versions when the save returns. ──
  const saveQuoteMutation = useSaveQuote(api);
  const saveDraftMutation = useSaveDraft(api);
  const saveQuoteAsync = saveQuoteMutation.mutateAsync;
  const saveDraftAsync = saveDraftMutation.mutateAsync;

  const saveQuote = useCallback(() => {
    const run = lastRunRef.current;
    if (calcRef.current.status !== "READY" || run === null || run.seq !== calcRef.current.seq) return; // "click Run first"
    if (saveRef.current.quote === "SAVING") return; // a duplicate click
    const version = lifecycleRef.current.formVersion;
    dispatchSave({ type: "saveClicked", kind: "quote", version });
    saveQuoteAsync({ form: run.body, precisionMode: run.precision }).then(
      (res) => {
        if (res.success) {
          dispatchSave({ type: "saveSucceeded", kind: "quote", version });
          dispatchLifecycle({ type: "saved", version });
        } else {
          dispatchSave({ type: "saveSoftFailed", kind: "quote" });
        }
      },
      (err: unknown) => {
        if (err instanceof ApiError && err.status === 422) dispatchSave({ type: "save422", kind: "quote", detail: err.message });
        else dispatchSave({ type: "saveNetworkError", kind: "quote" });
      },
    );
  }, [saveQuoteAsync]);

  const saveDraft = useCallback(() => {
    if (saveRef.current.draft === "SAVING") return;
    const version = lifecycleRef.current.formVersion;
    dispatchSave({ type: "saveClicked", kind: "draft", version });
    saveDraftAsync({ rawForm: collectDraftBody(valuesRef.current) }).then(
      (res) => {
        if (res.success) {
          dispatchSave({ type: "saveSucceeded", kind: "draft", version });
          dispatchLifecycle({ type: "saved", version });
        } else {
          dispatchSave({ type: "saveSoftFailed", kind: "draft" });
        }
      },
      () => dispatchSave({ type: "saveNetworkError", kind: "draft" }),
    );
  }, [saveDraftAsync]);

  // The resume-draft banner is decided once, from the first answer: a draft saved later in the session must not
  // announce itself, and a dismissed banner stays dismissed.
  const latest = useLatestDraft(api);
  const bannerDecided = useRef(false);
  useEffect(() => {
    if (!latest.isSuccess || bannerDecided.current) return;
    bannerDecided.current = true;
    dispatchLifecycle({ type: "draftLatestLoaded", exists: latest.data.draft !== null && latest.data.draft !== undefined });
  }, [latest.isSuccess, latest.data]);

  // ── reference data and guarded auto-fill (SA-12, SA-16, SA-17) ──
  const routes = useCompanyRoutes(api).data ?? EMPTY_ROUTES;
  const customPorts = useCustomPorts(api).data ?? EMPTY_CUSTOM_PORTS;

  const port = values.bunkering_port;
  const bunker = useBunkerPrice(api, port);
  // No lookup was made (blank or custom port, or still loading) => nothing to fill and nothing to explain.
  const bunkerVm = useMemo(
    () =>
      bunker.isSuccess
        ? buildBunkerAutofillVM({ port: (port ?? "").trim() }, { bunkering_port: port }, bunker.data ?? null, new Date())
        : { patch: {}, caption: null },
    [port, bunker.isSuccess, bunker.data],
  );
  const bunkerApplied = useRef<string | null>(null);
  useEffect(() => {
    bunkerApplied.current = null; // picking a port again refills, even from the cache
  }, [port]);
  useEffect(() => {
    if (!bunker.isSuccess) return;
    if (bunkerLoaded.current !== null) {
      if (bunkerLoaded.current === port) return;
      bunkerLoaded.current = null;
    }
    const key = `${port}|${bunker.dataUpdatedAt}`;
    if (bunkerApplied.current === key) return;
    bunkerApplied.current = key;
    applyPatch(bunkerVm.patch);
  }, [bunker.isSuccess, bunker.dataUpdatedAt, port, bunkerVm, applyPatch]);

  const dwt = values.vessel_dwt;
  const hasCrane = values.has_crane === true;
  const vessel = useVesselConsumption(api, dwt, hasCrane);
  const vesselApplied = useRef<string | null>(null);
  useEffect(() => {
    vesselApplied.current = null;
  }, [dwt, hasCrane]);
  useEffect(() => {
    if (!vessel.isSuccess || dwt === null) return;
    if (vesselLoaded.current !== null) {
      if (vesselLoaded.current === `${dwt}|${hasCrane}`) return;
      vesselLoaded.current = null;
    }
    const key = `${dwt}|${hasCrane}|${vessel.dataUpdatedAt}`;
    if (vesselApplied.current === key) return;
    vesselApplied.current = key;
    applyPatch(buildVesselPrefillPatch({ dwt, hasCrane }, { vessel_dwt: dwt, has_crane: values.has_crane }, vessel.data ?? null));
  }, [vessel.isSuccess, vessel.dataUpdatedAt, vessel.data, dwt, hasCrane, values.has_crane, applyPatch]);

  // ── voyage ports -> load_port / discharge_port (v1.2, design_frontend.md §12, PT-21): the tagged rows in the
  // sequence are the only place these are set now (no separate Load port / Discharge port fields) ──
  const derivedLoadPort = loadPortOf(values.voyage_ports);
  const derivedDischargePort = dischargePortOf(values.voyage_ports);
  useEffect(() => {
    if (values.load_port === derivedLoadPort && values.discharge_port === derivedDischargePort) return;
    applyPatch({ load_port: derivedLoadPort, discharge_port: derivedDischargePort });
  }, [derivedLoadPort, derivedDischargePort, values.load_port, values.discharge_port, applyPatch]);

  // An invalid sequence (duplicate Load/Discharge, or Discharge before Load) clears both distances rather than
  // leaving whatever was computed before the sequence broke — found 2026-09-22: reordering into an invalid state
  // left a stale, in this case doubled, ballast_distance sitting next to the "Discharge must come after Load" error.
  const portsError = validateVoyagePorts(values.voyage_ports);
  const portsErrorApplied = useRef(false);
  useEffect(() => {
    if (portsError) {
      if (portsErrorApplied.current) return;
      portsErrorApplied.current = true;
      applyPatch({ ballast_distance: null, laden_distance: null });
    } else {
      portsErrorApplied.current = false;
    }
  }, [portsError, applyPatch]);

  // ── distance lookup: ballast sums the legs before the load row plus the legs from the discharge row onward
  // (both "empty ship"); laden sums the legs from the load row to the discharge row ──
  const preLoad = useMemo(() => preLoadChain(values.voyage_ports), [values.voyage_ports]);
  const postDischarge = useMemo(() => postDischargeChain(values.voyage_ports), [values.voyage_ports]);
  const ladenPorts = useMemo(() => ladenChain(values.voyage_ports), [values.voyage_ports]);

  const preLoadQueries = useDistanceChain(api, preLoad);
  const postDischargeQueries = useDistanceChain(api, postDischarge);
  const ladenQueries = useDistanceChain(api, ladenPorts);

  const legsOf = (chain: string[], queries: ReturnType<typeof useDistanceChain>): DistanceLeg[] =>
    queries.map((q, i) => ({ a: chain[i], b: chain[i + 1], result: q.isSuccess ? (q.data ?? null) : undefined }));
  const ballastLegs = useMemo(
    () => [...legsOf(preLoad, preLoadQueries), ...legsOf(postDischarge, postDischargeQueries)],
    [preLoad, preLoadQueries, postDischarge, postDischargeQueries],
  );
  const ladenLegs = useMemo(() => legsOf(ladenPorts, ladenQueries), [ladenPorts, ladenQueries]);

  const ballastVm = useMemo(() => buildBallastDistanceVM(ballastLegs), [ballastLegs]);
  const ladenVm = useMemo(() => buildLadenDistanceVM(ladenLegs), [ladenLegs]);

  const ballastChainKey = `${preLoad.join("|")}~${postDischarge.join("|")}`;
  const ballastDataKey = [...preLoadQueries, ...postDischargeQueries].map((q) => q.dataUpdatedAt).join("|");
  const ballastApplied = useRef<string | null>(null);
  useEffect(() => {
    ballastApplied.current = null; // a different chain (or picking the same ports again) refills, even from the cache
  }, [ballastChainKey]);
  useEffect(() => {
    if (ballastLegs.some((l) => l.result === undefined)) return;
    const key = `${ballastChainKey}|${ballastDataKey}`;
    if (ballastApplied.current === key) return;
    ballastApplied.current = key;
    applyPatch(ballastVm.patch);
  }, [ballastChainKey, ballastDataKey, ballastLegs, ballastVm, applyPatch]);

  const ladenChainKey = ladenPorts.join("|");
  const ladenDataKey = ladenQueries.map((q) => q.dataUpdatedAt).join("|");
  const ladenApplied = useRef<string | null>(null);
  useEffect(() => {
    ladenApplied.current = null;
  }, [ladenChainKey]);
  useEffect(() => {
    if (ladenLegs.some((l) => l.result === undefined)) return;
    const key = `${ladenChainKey}|${ladenDataKey}`;
    if (ladenApplied.current === key) return;
    ladenApplied.current = key;
    applyPatch(ladenVm.patch);
  }, [ladenChainKey, ladenDataKey, ladenLegs, ladenVm, applyPatch]);

  // ── field recognition, PT-18 (design_backend.md §20): one `useFieldRecognition` per recognised field — cargo
  // (first slice, design_frontend.md §13), terms (second slice, §14), ports (third slice, §15, `voyage_ports` is a
  // list rather than a scalar, compared by content). See that hook's docstring for why the caption/offer lifecycle
  // is shared code now, not a hand-copied pattern — the ports slice had to independently rediscover a bug cargo and
  // terms had already fixed, specifically because the fix was only ever documented as reusable, not shared as code.
  const strEqual = (a: string | null, b: string | null) => a === b;
  const numEqual = (a: number | null, b: number | null) => a === b;
  const listEqual = (a: Values["voyage_ports"], b: Values["voyage_ports"]) => JSON.stringify(a) === JSON.stringify(b);
  const laycanEqual = (a: LaycanRange, b: LaycanRange) => a.start === b.start && a.end === b.end;
  const cargo = useFieldRecognition(values.cargo_description, strEqual);
  const terms = useFieldRecognition(values.contract_terms, strEqual);
  const ports = useFieldRecognition(values.voyage_ports, listEqual);
  const quantity = useFieldRecognition(values.quantity, numEqual);
  const laycan = useFieldRecognition<LaycanRange>({ start: values.laycan_start, end: values.laycan_end }, laycanEqual);

  // One click recognises every field the recogniser currently supports (cargo, terms, ports, quantity, laycan — more
  // will join this same button as they are designed, design_frontend.md §13's "Recognise fields" is deliberately
  // plural). The "no enquiry text" notice is shown once, under cargo only, rather than duplicated under every field.
  const recogniseFields = useCallback(() => {
    const notes = valuesRef.current.cargo_notes;
    if (!(notes ?? "").trim()) {
      cargo.commit({ kind: "warn", key: "cargoNoEnquiryText" }, null, valuesRef.current.cargo_description);
      terms.dismiss();
      ports.dismiss();
      quantity.dismiss();
      laycan.dismiss();
      return;
    }
    const cargoVm = buildCargoRecognitionVM(notes, valuesRef.current.cargo_description);
    const termsVm = buildTermsRecognitionVM(notes, valuesRef.current.contract_terms);
    const portsVm = buildPortsRecognitionVM(notes, valuesRef.current.voyage_ports, customPorts);
    const quantityVm = buildQuantityRecognitionVM(notes, valuesRef.current.quantity);
    const laycanVm = buildLaycanRecognitionVM(notes, valuesRef.current.laycan_start, valuesRef.current.laycan_end, valuesRef.current.fill_in_date ?? todayIso());
    const patch = { ...cargoVm.patch, ...termsVm.patch, ...portsVm.patch, ...quantityVm.patch, ...laycanVm.patch };
    if (Object.keys(patch).length > 0) applyPatch(patch);
    cargo.commit(cargoVm.caption, cargoVm.offerValue ?? null, (cargoVm.patch.cargo_description as string | null | undefined) ?? valuesRef.current.cargo_description);
    terms.commit(termsVm.caption, termsVm.offerValue ?? null, (termsVm.patch.contract_terms as string | null | undefined) ?? valuesRef.current.contract_terms);
    ports.commit(portsVm.caption, portsVm.offerValue ?? null, portsVm.patch.voyage_ports ?? valuesRef.current.voyage_ports);
    quantity.commit(quantityVm.caption, quantityVm.offerValue ?? null, (quantityVm.patch.quantity as number | null | undefined) ?? valuesRef.current.quantity);
    laycan.commit(
      laycanVm.caption,
      laycanVm.offerValue ?? null,
      laycanVm.patch.laycan_start !== undefined
        ? { start: laycanVm.patch.laycan_start as string | null, end: laycanVm.patch.laycan_end as string | null }
        : { start: valuesRef.current.laycan_start, end: valuesRef.current.laycan_end },
    );
  }, [applyPatch, customPorts, cargo, terms, ports, quantity, laycan]);

  // Accepting an offer (design_frontend.md §13/§14/§15) is the one place a differing value is ever overwritten —
  // always an explicit click, never automatic.
  const acceptCargoOffer = useCallback(() => {
    if (cargo.offer === null) return;
    applyPatch({ cargo_description: cargo.offer });
    cargo.dismiss();
  }, [cargo, applyPatch]);
  const acceptTermsOffer = useCallback(() => {
    if (terms.offer === null) return;
    applyPatch({ contract_terms: terms.offer });
    terms.dismiss();
  }, [terms, applyPatch]);
  const acceptPortsOffer = useCallback(() => {
    if (ports.offer === null) return;
    applyPatch({ voyage_ports: ports.offer });
    ports.dismiss();
  }, [ports, applyPatch]);
  const acceptQuantityOffer = useCallback(() => {
    if (quantity.offer === null) return;
    applyPatch({ quantity: quantity.offer });
    quantity.dismiss();
  }, [quantity, applyPatch]);
  const acceptLaycanOffer = useCallback(() => {
    if (laycan.offer === null) return;
    applyPatch({ laycan_start: laycan.offer.start, laycan_end: laycan.offer.end });
    laycan.dismiss();
  }, [laycan, applyPatch]);

  const value = useMemo<WorkspaceValue>(
    () => ({
      values,
      setField,
      lifecycle,
      dispatchLifecycle,
      requestLoad,
      confirmReplace,
      cancelReplace,
      calc,
      calcBody: body,
      runPrecision: lastRun?.precision ?? precisionMode,
      precisionMode,
      setPrecisionMode,
      run,
      clearAll,
      calcQuery,
      verdictData,
      save,
      dispatchSave,
      saveQuote,
      saveDraft,
      loadNotice,
      dismissLoadNotice,
      latestDraft: latest.data,
      routes,
      customPorts,
      bunkerCaption: bunkerVm.caption,
      ballastCaption: ballastVm.caption,
      ladenCaption: ladenVm.caption,
      cargoCaption: cargo.caption,
      cargoOffer: cargo.offer,
      termsCaption: terms.caption,
      termsOffer: terms.offer,
      portsCaption: ports.caption,
      quantityCaption: quantity.caption,
      quantityOffer: quantity.offer,
      laycanCaption: laycan.caption,
      laycanOffer: laycan.offer,
      recogniseFields,
      dismissCargoCaption: cargo.dismiss,
      dismissTermsCaption: terms.dismiss,
      dismissQuantityCaption: quantity.dismiss,
      dismissLaycanCaption: laycan.dismiss,
      acceptCargoOffer,
      acceptTermsOffer,
      acceptPortsOffer,
      acceptQuantityOffer,
      acceptLaycanOffer,
    }),
    [
      values,
      setField,
      lifecycle,
      requestLoad,
      confirmReplace,
      cancelReplace,
      calc,
      body,
      lastRun,
      precisionMode,
      setPrecisionMode,
      run,
      clearAll,
      calcQuery,
      verdictData,
      save,
      saveQuote,
      saveDraft,
      loadNotice,
      dismissLoadNotice,
      latest.data,
      routes,
      customPorts,
      bunkerVm.caption,
      ballastVm.caption,
      ladenVm.caption,
      cargo,
      terms,
      ports,
      quantity,
      laycan,
      recogniseFields,
      acceptCargoOffer,
      acceptTermsOffer,
      acceptPortsOffer,
      acceptQuantityOffer,
      acceptLaycanOffer,
    ],
  );

  const formValue = useMemo<FormValue>(
    () => ({
      values,
      setField,
      routes,
      customPorts,
      bunkerCaption: bunkerVm.caption,
      ballastCaption: ballastVm.caption,
      ladenCaption: ladenVm.caption,
      cargoCaption: cargo.caption,
      cargoOffer: cargo.offer,
      termsCaption: terms.caption,
      termsOffer: terms.offer,
      portsCaption: ports.caption,
      quantityCaption: quantity.caption,
      quantityOffer: quantity.offer,
      laycanCaption: laycan.caption,
      laycanOffer: laycan.offer,
      recogniseFields,
      dismissCargoCaption: cargo.dismiss,
      dismissTermsCaption: terms.dismiss,
      dismissQuantityCaption: quantity.dismiss,
      dismissLaycanCaption: laycan.dismiss,
      acceptCargoOffer,
      acceptTermsOffer,
      acceptPortsOffer,
      acceptQuantityOffer,
      acceptLaycanOffer,
    }),
    [
      values,
      setField,
      routes,
      customPorts,
      bunkerVm.caption,
      ballastVm.caption,
      ladenVm.caption,
      cargo,
      terms,
      ports,
      quantity,
      laycan,
      recogniseFields,
      acceptCargoOffer,
      acceptTermsOffer,
      acceptPortsOffer,
      acceptQuantityOffer,
      acceptLaycanOffer,
    ],
  );

  return (
    <FormContext.Provider value={formValue}>
      <WorkspaceContext.Provider value={value}>
        {children}
        <ReplaceModal />
      </WorkspaceContext.Provider>
    </FormContext.Provider>
  );
}
