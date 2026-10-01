import { createContext, useContext, type Dispatch } from "react";
import type { Api } from "../api/api";
import type { CurrentUserProfile } from "../api/types";
import type { AuthEvent, AuthState } from "../state/authMachine";

export const ApiContext = createContext<Api | null>(null);

export function useApi(): Api {
  const api = useContext(ApiContext);
  if (!api) throw new Error("useApi must be used inside <AppProviders>");
  return api;
}

export interface AuthContextValue {
  state: AuthState;
  dispatch: Dispatch<AuthEvent>;
  me: CurrentUserProfile | undefined;
  retryBootstrap: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

// The F-Http client is created before any React state exists, so its callbacks go through this mutable bridge.
export interface AuthBridge {
  onSessionExpired: () => void;
  onRefreshUnavailable: () => void;
  onRefreshSucceeded: () => void;
}
export const AuthBridgeContext = createContext<{ current: AuthBridge } | null>(null);
