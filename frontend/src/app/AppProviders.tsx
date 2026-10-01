import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfigProvider } from "antd";
import enUS from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";
import type { i18n as I18n } from "i18next";
import { useMemo, useRef, type ReactNode } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import { createApi } from "../api/api";
import { createHttpClient } from "../api/http";
import { AuthProvider } from "./AuthProvider";
import { ApiContext, AuthBridgeContext, type AuthBridge } from "./contexts";

export const THEME_PRIMARY = "#125993";

function Themed({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  return (
    <ConfigProvider locale={i18n.language === "zh" ? zhCN : enUS} theme={{ token: { colorPrimary: THEME_PRIMARY } }}>
      {children}
    </ConfigProvider>
  );
}

export function AppProviders({ baseUrl, i18n, children }: { baseUrl: string; i18n: I18n; children: ReactNode }) {
  const bridge = useRef<AuthBridge>({ onSessionExpired: () => {}, onRefreshUnavailable: () => {}, onRefreshSucceeded: () => {} });
  const { queryClient, api } = useMemo(() => {
    const client = createHttpClient({
      baseURL: baseUrl,
      onSessionExpired: () => bridge.current.onSessionExpired(),
      onRefreshUnavailable: () => bridge.current.onRefreshUnavailable(),
      onRefreshSucceeded: () => bridge.current.onRefreshSucceeded(),
    });
    return {
      queryClient: new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } }),
      api: createApi(client),
    };
  }, [baseUrl]);

  return (
    <I18nextProvider i18n={i18n}>
      <Themed>
        <QueryClientProvider client={queryClient}>
          <AuthBridgeContext.Provider value={bridge}>
            <ApiContext.Provider value={api}>
              <AuthProvider>{children}</AuthProvider>
            </ApiContext.Provider>
          </AuthBridgeContext.Provider>
        </QueryClientProvider>
      </Themed>
    </I18nextProvider>
  );
}
