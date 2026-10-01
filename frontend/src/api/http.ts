import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from "axios";

export type ApiErrorCode = "SESSION_EXPIRED" | "AUTH_UNAVAILABLE";

export class ApiError extends Error {
  readonly status: number | undefined;
  readonly code: ApiErrorCode | undefined;
  readonly detail: unknown;

  constructor(message: string, opts: { status?: number; code?: ApiErrorCode; detail?: unknown } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = opts.status;
    this.code = opts.code;
    this.detail = opts.detail;
  }
}

export interface HttpClientOptions {
  baseURL: string;
  onSessionExpired: () => void;
  onRefreshUnavailable: () => void;
  onRefreshSucceeded: () => void;
}

const REFRESH_URL = "/api/v1/auth/refresh";
const NO_REFRESH_URLS = new Set([
  REFRESH_URL,
  "/api/v1/auth/login",
  "/api/v1/auth/register",
  "/api/v1/auth/logout",
]);

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

function messageFromDetail(detail: unknown): string | null {
  if (typeof detail === "string" && detail.trim() !== "") return detail;
  if (Array.isArray(detail)) {
    const parts = detail.map((item) => {
      if (item && typeof item === "object" && "msg" in item) {
        const loc = Array.isArray((item as { loc?: unknown }).loc)
          ? (item as { loc: unknown[] }).loc.filter((p) => p !== "body").join(".")
          : "";
        const msg = String((item as { msg: unknown }).msg);
        return loc ? `${loc}: ${msg}` : msg;
      }
      return String(item);
    });
    return parts.join("; ");
  }
  return null;
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (axios.isAxiosError(error)) {
    if (!error.response) return new ApiError("Network error: the server could not be reached.");
    const { status, data } = error.response;
    const detail = data && typeof data === "object" ? (data as { detail?: unknown }).detail : undefined;
    return new ApiError(messageFromDetail(detail) ?? `Request failed (${status})`, { status, detail });
  }
  return new ApiError(error instanceof Error ? error.message : "Unexpected error");
}

export function createHttpClient(options: HttpClientOptions): AxiosInstance {
  const client = axios.create({ baseURL: options.baseURL, withCredentials: true });

  // One refresh in flight per client; every concurrent 401 awaits the same promise (design_backend.md §9.3).
  let inFlight: Promise<ApiError | null> | null = null;

  function refreshOnce(): Promise<ApiError | null> {
    if (inFlight) return inFlight;
    inFlight = client
      .post(REFRESH_URL)
      .then(() => {
        options.onRefreshSucceeded();
        return null;
      })
      .catch((e: unknown) => {
        // the refresh goes through this same client, so its failure has already been normalised to an ApiError
        const status = toApiError(e).status;
        if (status === 401) {
          options.onSessionExpired();
          return new ApiError("Your session has expired.", { status: 401, code: "SESSION_EXPIRED" });
        }
        // 503, network failure, anything else: the session is not known to be invalid.
        options.onRefreshUnavailable();
        return new ApiError("Authentication is temporarily unavailable.", { status, code: "AUTH_UNAVAILABLE" });
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  }

  client.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const config = error.config as RetriableConfig | undefined;
      const is401 = error.response?.status === 401;
      const eligible = is401 && config && !config._retried && !NO_REFRESH_URLS.has(config.url ?? "");
      if (!eligible) throw toApiError(error);

      const refreshFailure = await refreshOnce();
      if (refreshFailure) throw refreshFailure;

      config._retried = true;
      try {
        return await client.request(config);
      } catch (retryError) {
        throw toApiError(retryError);
      }
    },
  );

  return client;
}
