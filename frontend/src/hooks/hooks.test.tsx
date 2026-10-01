import { act, renderHook, waitFor } from "@testing-library/react";
import { useCalculate, useRiskScenarios, useSandbox, useBunkerPrice, useVesselConsumption, useHistoryLists } from "./queries";
import { useBulkDelete, useLogout, useSaveDraft, useSaveQuote } from "./mutations";
import { QUERY_KEYS } from "./queryKeys";
import { collectForm } from "../form/collect";
import { completeForm } from "../test/fixtures";
import { deferred, fakeApi, makeQueryClient, makeWrapper } from "../test/render";
import { makeBunker, makeDraftRow, makeQuoteResult, makeQuoteRow } from "../test/dto";

const body = collectForm(completeForm());

describe("F-Hooks", () => {
  test("S01 form incomplete -> calculate / sandbox / risk queries are not enabled (no request)", async () => {
    const api = fakeApi({ calculate: vi.fn(), sandbox: vi.fn(), riskScenarios: vi.fn() });
    const client = makeQueryClient();
    renderHook(
      () => {
        useCalculate(api, 1, null);
        useSandbox(api, 1, null, { sandbox_freight_rate: 20 });
        useRiskScenarios(api, 1, null);
      },
      { wrapper: makeWrapper(client) },
    );
    await act(async () => {});
    expect(api.calculate).not.toHaveBeenCalled();
    expect(api.sandbox).not.toHaveBeenCalled();
    expect(api.riskScenarios).not.toHaveBeenCalled();
  });

  test("a complete form enables the calculate query, keyed by seq", async () => {
    const api = fakeApi({ calculate: vi.fn().mockResolvedValue(makeQuoteResult()) });
    const client = makeQueryClient();
    const { result } = renderHook(() => useCalculate(api, 3, body), { wrapper: makeWrapper(client) });
    await waitFor(() => expect(result.current.data).toEqual(makeQuoteResult()));
    expect(client.getQueryData(QUERY_KEYS.calculate(3))).toEqual(makeQuoteResult());
    expect(api.calculate).toHaveBeenCalledWith(body, undefined);
  });

  test("S02 Save Quote succeeds -> history (incl. search) and company/routes are invalidated", async () => {
    const api = fakeApi({ saveQuote: vi.fn().mockResolvedValue({ success: true }) });
    const client = makeQueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useSaveQuote(api), { wrapper: makeWrapper(client) });
    await act(async () => void (await result.current.mutateAsync({ form: body })));
    const keys = spy.mock.calls.map((c) => (c[0] as { queryKey: unknown }).queryKey);
    expect(keys).toContainEqual(QUERY_KEYS.historyAll);
    expect(keys).toContainEqual(QUERY_KEYS.companyRoutes);
    expect(keys).not.toContainEqual(QUERY_KEYS.latestDraft);
  });

  test("Save Quote answering success:false invalidates nothing (SOFT failure)", async () => {
    const api = fakeApi({ saveQuote: vi.fn().mockResolvedValue({ success: false }) });
    const client = makeQueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useSaveQuote(api), { wrapper: makeWrapper(client) });
    await act(async () => void (await result.current.mutateAsync({ form: body })));
    expect(spy).not.toHaveBeenCalled();
  });

  test("S03 Save Draft succeeds -> history (incl. search) and drafts/latest are invalidated", async () => {
    const api = fakeApi({ saveDraft: vi.fn().mockResolvedValue({ success: true }) });
    const client = makeQueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useSaveDraft(api), { wrapper: makeWrapper(client) });
    await act(async () => void (await result.current.mutateAsync({ rawForm: { route: "A" } })));
    const keys = spy.mock.calls.map((c) => (c[0] as { queryKey: unknown }).queryKey);
    expect(keys).toContainEqual(QUERY_KEYS.historyAll);
    expect(keys).toContainEqual(QUERY_KEYS.latestDraft);
    expect(keys).not.toContainEqual(QUERY_KEYS.companyRoutes);
  });

  test("S04 bulk-delete finishes -> both lists invalidated; only the non-empty sides are called", async () => {
    const api = fakeApi({
      bulkDeleteQuotes: vi.fn().mockResolvedValue({ deleted_count: 2 }),
      bulkDeleteDrafts: vi.fn().mockResolvedValue({ deleted_count: 1 }),
    });
    const client = makeQueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useBulkDelete(api), { wrapper: makeWrapper(client) });
    let outcome: unknown;
    await act(async () => void (outcome = await result.current.mutateAsync(["q1", "q2", "d9"])));
    expect(api.bulkDeleteQuotes).toHaveBeenCalledWith([1, 2]);
    expect(api.bulkDeleteDrafts).toHaveBeenCalledWith([9]);
    expect(outcome).toEqual({ outcome: "allSucceeded", report: { quotesDeleted: 2, draftsDeleted: 1, failed: [] } });
    expect(spy.mock.calls.map((c) => (c[0] as { queryKey: unknown }).queryKey)).toContainEqual(QUERY_KEYS.historyAll);

    (api.bulkDeleteQuotes as ReturnType<typeof vi.fn>).mockClear();
    (api.bulkDeleteDrafts as ReturnType<typeof vi.fn>).mockClear();
    await act(async () => void (await result.current.mutateAsync(["q5"])));
    expect(api.bulkDeleteDrafts).not.toHaveBeenCalled();
  });

  test("bulk-delete: one side rejects -> someFailed, list still refetched; both reject -> allFailed, no refetch", async () => {
    const api = fakeApi({
      bulkDeleteQuotes: vi.fn().mockResolvedValue({ deleted_count: 1 }),
      bulkDeleteDrafts: vi.fn().mockRejectedValue(new Error("500")),
    });
    const client = makeQueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useBulkDelete(api), { wrapper: makeWrapper(client) });
    let partial: { outcome: string; report: { failed: string[] } } | undefined;
    await act(async () => void (partial = (await result.current.mutateAsync(["q1", "d2"])) as never));
    expect(partial!.outcome).toBe("someFailed");
    expect(partial!.report.failed).toEqual(["drafts"]);
    expect(spy).toHaveBeenCalled();

    spy.mockClear();
    (api.bulkDeleteQuotes as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("500"));
    let none: { outcome: string } | undefined;
    await act(async () => void (none = (await result.current.mutateAsync(["q1", "d2"])) as never));
    expect(none!.outcome).toBe("allFailed");
    expect(spy).not.toHaveBeenCalled();
  });

  test("S05 logout -> queryClient.clear() is called; a failed logout clears nothing", async () => {
    const client = makeQueryClient();
    client.setQueryData(["auth", "me"], { user_id: 1 });
    const clearSpy = vi.spyOn(client, "clear");
    const api = fakeApi({ logout: vi.fn().mockResolvedValue({ success: true }) });
    const { result } = renderHook(() => useLogout(api), { wrapper: makeWrapper(client) });
    await act(async () => void (await result.current.mutateAsync()));
    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(["auth", "me"])).toBeUndefined();

    const client2 = makeQueryClient();
    client2.setQueryData(["auth", "me"], { user_id: 1 });
    const clear2 = vi.spyOn(client2, "clear");
    const failing = fakeApi({ logout: vi.fn().mockRejectedValue(new Error("500")) });
    const { result: r2 } = renderHook(() => useLogout(failing), { wrapper: makeWrapper(client2) });
    await act(async () => void (await r2.current.mutateAsync().catch(() => undefined)));
    expect(clear2).not.toHaveBeenCalled();
    expect(client2.getQueryData(["auth", "me"])).toEqual({ user_id: 1 });
  });

  test("S06 a custom (unknown) bunkering port -> bunker-price is NOT called; a known port is", async () => {
    const api = fakeApi({ bunkerPrice: vi.fn().mockResolvedValue(makeBunker()) });
    const client = makeQueryClient();
    const custom = renderHook(() => useBunkerPrice(api, "My Private Anchorage"), { wrapper: makeWrapper(client) });
    await act(async () => {});
    expect(api.bunkerPrice).not.toHaveBeenCalled();
    custom.unmount();
    const known = renderHook(() => useBunkerPrice(api, "SINGAPORE"), { wrapper: makeWrapper(client) });
    await waitFor(() => expect(known.result.current.data).toEqual(makeBunker()));
    expect(api.bunkerPrice).toHaveBeenCalledWith("SINGAPORE");
    expect(client.getQueryData(QUERY_KEYS.bunker("SINGAPORE"))).toBeDefined();
  });

  test("the vessel-consumption query runs only for a positive whole DWT and is keyed by (dwt, hasCrane)", async () => {
    const api = fakeApi({ vesselConsumption: vi.fn().mockResolvedValue(null) });
    const client = makeQueryClient();
    const bad = renderHook(() => useVesselConsumption(api, 2800.5, false), { wrapper: makeWrapper(client) });
    const none = renderHook(() => useVesselConsumption(api, null, false), { wrapper: makeWrapper(client) });
    await act(async () => {});
    expect(api.vesselConsumption).not.toHaveBeenCalled();
    bad.unmount();
    none.unmount();
    renderHook(() => useVesselConsumption(api, 8000, true), { wrapper: makeWrapper(client) });
    await waitFor(() => expect(api.vesselConsumption).toHaveBeenCalledWith(8000, true));
    expect(client.getQueryState(QUERY_KEYS.vessel(8000, true))).toBeDefined();
  });

  test("S07 [REVIEW 1] out-of-order calculation responses: the displayed data is seq 6's; seq 5's is never displayed", async () => {
    const res5 = makeQuoteResult({ reason: "from seq 5" });
    const res6 = makeQuoteResult({ reason: "from seq 6" });
    const d5 = deferred<typeof res5>();
    const d6 = deferred<typeof res6>();
    const calculate = vi.fn().mockImplementationOnce(() => d5.promise).mockImplementationOnce(() => d6.promise);
    const api = fakeApi({ calculate });
    const seen: unknown[] = [];
    const { result, rerender } = renderHook(
      ({ seq }) => {
        const q = useCalculate(api, seq, body);
        seen.push(q.data);
        return q;
      },
      { initialProps: { seq: 5 }, wrapper: makeWrapper(makeQueryClient()) },
    );
    await waitFor(() => expect(calculate).toHaveBeenCalledTimes(1));
    rerender({ seq: 6 });
    await waitFor(() => expect(calculate).toHaveBeenCalledTimes(2));

    await act(async () => d6.resolve(res6));
    await waitFor(() => expect(result.current.data).toBe(res6));
    await act(async () => d5.resolve(res5));
    await act(async () => {});

    expect(result.current.data).toBe(res6);
    expect(seen).not.toContain(res5);
  });

  test("[REVIEW 1] while a new seq loads, the previous result stays available as a placeholder", async () => {
    const res5 = makeQuoteResult({ reason: "from seq 5" });
    const d6 = deferred<ReturnType<typeof makeQuoteResult>>();
    const calculate = vi.fn().mockResolvedValueOnce(res5).mockImplementationOnce(() => d6.promise);
    const api = fakeApi({ calculate });
    const { result, rerender } = renderHook(({ seq }) => useCalculate(api, seq, body), {
      initialProps: { seq: 5 },
      wrapper: makeWrapper(makeQueryClient()),
    });
    await waitFor(() => expect(result.current.data).toBe(res5));
    rerender({ seq: 6 });
    await waitFor(() => expect(result.current.isPlaceholderData).toBe(true));
    expect(result.current.data).toBe(res5);
  });

  test("S08 [REVIEW 5] history responses out of order after two quick range changes: the newest range's rows are displayed", async () => {
    const older = { quotes: [makeQuoteRow({ id: 1 })], drafts: [] };
    const newer = { quotes: [makeQuoteRow({ id: 2 })], drafts: [makeDraftRow({ id: 3 })] };
    const dOld = deferred<typeof older.quotes>();
    const dNew = deferred<typeof newer.quotes>();
    const quoteHistory = vi.fn().mockImplementationOnce(() => dOld.promise).mockImplementationOnce(() => dNew.promise);
    const draftHistory = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce(newer.drafts);
    const api = fakeApi({ quoteHistory, draftHistory });
    const seen: unknown[] = [];
    const { result, rerender } = renderHook(
      ({ listSeq, range }: { listSeq: number; range: [string, string] }) => {
        const q = useHistoryLists(api, { mode: "range", monthRange: range }, listSeq);
        seen.push(q.data);
        return q;
      },
      { initialProps: { listSeq: 1, range: ["2026-08", "2026-08"] as [string, string] }, wrapper: makeWrapper(makeQueryClient()) },
    );
    await waitFor(() => expect(quoteHistory).toHaveBeenCalledTimes(1));
    rerender({ listSeq: 2, range: ["2026-09", "2026-09"] });
    await waitFor(() => expect(quoteHistory).toHaveBeenCalledTimes(2));

    await act(async () => dNew.resolve(newer.quotes));
    await waitFor(() => expect(result.current.data).toEqual(newer));
    await act(async () => dOld.resolve(older.quotes));
    await act(async () => {});

    expect(result.current.data).toEqual(newer);
    expect(seen).not.toContainEqual(older);
  });

  test("a history request fails if EITHER list fails (never half a list drawn as complete)", async () => {
    const api = fakeApi({ quoteHistory: vi.fn().mockResolvedValue([makeQuoteRow()]), draftHistory: vi.fn().mockRejectedValue(new Error("500")) });
    const { result } = renderHook(() => useHistoryLists(api, { mode: "range", monthRange: ["2026-09", "2026-09"] }, 1), {
      wrapper: makeWrapper(makeQueryClient()),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  test("search mode calls the two search routes with the filters", async () => {
    const api = fakeApi({ searchQuotes: vi.fn().mockResolvedValue([]), searchDrafts: vi.fn().mockResolvedValue([]) });
    const filters = { route: "A", cargo_description: "", vessel_name: "", vessel_dwt: 0 };
    const { result } = renderHook(() => useHistoryLists(api, { mode: "search", filters }, 1), { wrapper: makeWrapper(makeQueryClient()) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.searchQuotes).toHaveBeenCalledWith(filters);
    expect(api.searchDrafts).toHaveBeenCalledWith(filters);
  });
});
