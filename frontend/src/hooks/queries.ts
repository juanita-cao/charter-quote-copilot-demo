import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";
import type { Api, SandboxKnobs, SearchFilters } from "../api/api";
import type { PrecisionMode, QuoteInput } from "../api/types";
import { isKnownPort } from "../config/bunkerPorts";
import { QUERY_KEYS, type HistoryQuery } from "./queryKeys";

export function useMe(api: Api, enabled = true) {
  return useQuery({ queryKey: QUERY_KEYS.me, queryFn: () => api.me(), enabled, retry: false });
}

// `body === null` means the form is incomplete: the query is not enabled and no request is made.
export function useCalculate(api: Api, seq: number, body: QuoteInput | null, precisionMode?: PrecisionMode) {
  return useQuery({
    queryKey: QUERY_KEYS.calculate(seq),
    queryFn: () => api.calculate(body as QuoteInput, precisionMode),
    enabled: body !== null,
    placeholderData: keepPreviousData,
  });
}

export function useSandbox(
  api: Api,
  seq: number,
  body: QuoteInput | null,
  knobs: SandboxKnobs | null,
  precisionMode?: PrecisionMode,
) {
  return useQuery({
    queryKey: QUERY_KEYS.sandbox(seq, knobs),
    queryFn: () => api.sandbox(body as QuoteInput, knobs as SandboxKnobs, precisionMode),
    enabled: body !== null && knobs !== null,
    placeholderData: keepPreviousData,
  });
}

export function useRiskScenarios(
  api: Api,
  seq: number,
  body: QuoteInput | null,
  deltas?: Record<string, number>,
  precisionMode?: PrecisionMode,
) {
  return useQuery({
    queryKey: QUERY_KEYS.risk(seq, deltas ?? null),
    queryFn: () => api.riskScenarios(body as QuoteInput, deltas, precisionMode),
    enabled: body !== null,
    placeholderData: keepPreviousData,
  });
}

// Both lists or neither: if either request fails the whole query fails, so half a list is never drawn as complete.
export function useHistoryLists(api: Api, query: HistoryQuery, listSeq: number) {
  const params = query.mode === "range" ? query.monthRange : query.filters;
  return useQuery({
    queryKey: QUERY_KEYS.history(query.mode, params, listSeq),
    queryFn: async () => {
      const [quotes, drafts] =
        query.mode === "range"
          ? await Promise.all([api.quoteHistory(...query.monthRange), api.draftHistory(...query.monthRange)])
          : await Promise.all([api.searchQuotes(query.filters), api.searchDrafts(query.filters)]);
      return { quotes, drafts };
    },
    placeholderData: keepPreviousData,
  });
}

// "Start from a previous quote": nothing is requested until the operator submits a search (filters === null).
export function usePreviousSearch(api: Api, filters: SearchFilters | null) {
  return useQuery({
    queryKey: QUERY_KEYS.previousSearch(filters),
    queryFn: async () => {
      const [quotes, drafts] = await Promise.all([api.searchQuotes(filters as SearchFilters), api.searchDrafts(filters as SearchFilters)]);
      return { quotes, drafts };
    },
    enabled: filters !== null,
  });
}

// A custom (unknown) port never triggers a lookup (predecessor rule).
export function useBunkerPrice(api: Api, port: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.bunker(port ?? ""),
    queryFn: () => api.bunkerPrice((port as string).trim()),
    enabled: isKnownPort(port),
  });
}

export function useVesselConsumption(api: Api, dwt: number | null, hasCrane: boolean) {
  const valid = dwt !== null && Number.isInteger(dwt) && dwt > 0;
  return useQuery({
    queryKey: QUERY_KEYS.vessel(dwt ?? 0, hasCrane),
    queryFn: () => api.vesselConsumption(dwt as number, hasCrane),
    enabled: valid,
  });
}

export function useCompanyRoutes(api: Api, enabled = true) {
  return useQuery({ queryKey: QUERY_KEYS.companyRoutes, queryFn: () => api.companyRoutes(), enabled });
}

export function useCustomPorts(api: Api, enabled = true) {
  return useQuery({ queryKey: QUERY_KEYS.customPorts, queryFn: () => api.customPorts(), enabled });
}

export function useBunkerPriceDashboard(api: Api, port: string) {
  return useQuery({
    queryKey: QUERY_KEYS.bunkerPriceDashboard(port),
    queryFn: () => api.bunkerPriceDashboard(port),
  });
}

export function useVesselTypeDashboard(api: Api) {
  return useQuery({
    queryKey: QUERY_KEYS.vesselTypeDashboard,
    queryFn: () => api.vesselTypeDashboard(),
  });
}

export function useFreightTrendDashboard(api: Api) {
  return useQuery({
    queryKey: QUERY_KEYS.freightTrendDashboard,
    queryFn: () => api.freightTrendDashboard(),
  });
}

export function usePortCostDashboard(api: Api) {
  return useQuery({
    queryKey: QUERY_KEYS.portCostDashboard,
    queryFn: () => api.portCostDashboard(),
  });
}

// One query per consecutive pair in `chain` (ports in travel order — the ballast or laden leg of the voyage
// sequence, PT-21) — a leg can be more than one hop. useQueries so the list length can change between renders.
export function useDistanceChain(api: Api, chain: string[]) {
  const pairs = chain.length >= 2 ? chain.slice(0, -1).map((a, i) => [a, chain[i + 1]] as const) : [];
  return useQueries({
    queries: pairs.map(([a, b]) => ({
      queryKey: QUERY_KEYS.distance(a, b),
      queryFn: () => api.distance(a, b),
      enabled: a !== b,
    })),
  });
}

export function useLatestDraft(api: Api, enabled = true) {
  return useQuery({ queryKey: QUERY_KEYS.latestDraft, queryFn: () => api.latestDraft(), enabled });
}
