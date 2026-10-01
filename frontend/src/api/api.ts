import type { AxiosInstance } from "axios";
import type {
  BunkerPriceReferencePoint,
  BunkerPriceResult,
  FreightTrendRow,
  PortCostRow,
  PrecisionMode,
  VesselTypeStatRow,
  CurrentUserProfile,
  DraftLatest,
  DraftRow,
  QuotationSandboxResult,
  QuoteCalculationResult,
  QuoteInput,
  QuoteRow,
  RegisterInput,
  RegisterResult,
  ReverseQuoteResult,
  RiskScenarioRow,
  VesselConsumptionProfile,
  DistanceResult,
} from "./types";

export interface SearchFilters {
  route?: string;
  cargo_description?: string;
  vessel_name?: string;
  vessel_dwt?: number;
}

export interface SandboxKnobs {
  target_tce?: number;
  sandbox_freight_rate?: number;
  sandbox_shipowner_ask?: number;
}

const P = "/api/v1";

// Optional arguments that were not given are left out entirely, never sent as null.
function defined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export function createApi(client: AxiosInstance) {
  const get = async <T>(url: string, params?: object): Promise<T> => (await client.get<T>(url, { params })).data;
  const post = async <T>(url: string, body?: object): Promise<T> => (await client.post<T>(url, body)).data;

  return {
    me: () => get<CurrentUserProfile>(`${P}/auth/me`),
    login: (email: string, password: string) => post<{ success: boolean }>(`${P}/auth/login`, { email, password }),
    register: (input: RegisterInput) => post<RegisterResult>(`${P}/auth/register`, input),
    logout: () => post<{ success: boolean }>(`${P}/auth/logout`),

    // `precisionMode` is the operator's choice for THIS calculation; left out entirely when not given (the company's
    // own setting then applies on the server).
    calculate: (form: QuoteInput, precisionMode?: PrecisionMode) =>
      post<QuoteCalculationResult>(`${P}/quotes/calculate`, { ...form, ...defined({ precision_mode: precisionMode }) }),
    reverseQuote: (form: QuoteInput, targetTce: number, precisionMode?: PrecisionMode) =>
      post<ReverseQuoteResult>(`${P}/quotes/reverse-quote`, {
        ...form,
        target_tce: targetTce,
        ...defined({ precision_mode: precisionMode }),
      }),
    sandbox: (form: QuoteInput, knobs: SandboxKnobs, precisionMode?: PrecisionMode) =>
      post<QuotationSandboxResult>(`${P}/quotes/sandbox`, { ...form, ...defined(knobs), ...defined({ precision_mode: precisionMode }) }),
    riskScenarios: (form: QuoteInput, deltas?: Record<string, number>, precisionMode?: PrecisionMode) =>
      post<RiskScenarioRow[]>(`${P}/quotes/risk-scenarios`, {
        ...form,
        ...defined({ deltas }),
        ...defined({ precision_mode: precisionMode }),
      }),
    saveQuote: (form: QuoteInput, targetTce?: number, precisionMode?: PrecisionMode) =>
      post<{ success: boolean }>(`${P}/quotes`, {
        ...form,
        ...defined({ target_tce: targetTce }),
        ...defined({ precision_mode: precisionMode }),
      }),
    quoteHistory: (startYm: string, endYm: string) => get<QuoteRow[]>(`${P}/quotes`, { start_ym: startYm, end_ym: endYm }),
    searchQuotes: (filters: SearchFilters) => get<QuoteRow[]>(`${P}/quotes/search`, defined(filters)),
    // The .xlsx of the selected records (`q12` / `d7` keys), as the server built it.
    exportRecords: async (recordKeys: string[]): Promise<Blob> =>
      (await client.post<Blob>(`${P}/export`, { record_keys: recordKeys }, { responseType: "blob" })).data,
    bulkDeleteQuotes: (ids: number[]) => post<{ deleted_count: number }>(`${P}/quotes/bulk-delete`, { record_ids: ids }),

    saveDraft: (rawForm: Record<string, unknown>) => post<{ success: boolean }>(`${P}/drafts`, rawForm),
    latestDraft: () => get<DraftLatest>(`${P}/drafts/latest`),
    draftHistory: (startYm: string, endYm: string) => get<DraftRow[]>(`${P}/drafts`, { start_ym: startYm, end_ym: endYm }),
    searchDrafts: (filters: SearchFilters) => get<DraftRow[]>(`${P}/drafts/search`, defined(filters)),
    bulkDeleteDrafts: (ids: number[]) => post<{ deleted_count: number }>(`${P}/drafts/bulk-delete`, { record_ids: ids }),

    bunkerPrice: (port: string) => get<BunkerPriceResult | null>(`${P}/bunker-price`, { port }),
    companyRoutes: () => get<string[]>(`${P}/company/routes`),
    vesselConsumption: (dwt: number, hasCrane: boolean) =>
      get<VesselConsumptionProfile | null>(`${P}/company/vessel-consumption`, { dwt, has_crane: hasCrane }),
    customPorts: () => get<string[]>(`${P}/company/custom-ports`),
    distance: (a: string, b: string) => get<DistanceResult | null>(`${P}/company/distance`, { a, b }),
    bunkerPriceDashboard: (port: string) => get<BunkerPriceReferencePoint[]>(`${P}/dashboards/bunker-price`, { port }),
    vesselTypeDashboard: () => get<VesselTypeStatRow[]>(`${P}/dashboards/vessel-type`),
    freightTrendDashboard: () => get<FreightTrendRow[]>(`${P}/dashboards/freight-trend`),
    portCostDashboard: () => get<PortCostRow[]>(`${P}/dashboards/port-cost`),
  };
}

export type Api = ReturnType<typeof createApi>;
