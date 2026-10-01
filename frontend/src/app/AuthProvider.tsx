import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import { ApiError } from "../api/http";
import { useMe } from "../hooks/queries";
import { authReducer, initialAuthState } from "../state/authMachine";
import { AuthBridgeContext, AuthContext, useApi } from "./contexts";

export function AuthProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const bridge = useContext(AuthBridgeContext);
  const [state, dispatch] = useReducer(authReducer, initialAuthState);
  const statusRef = useRef(state.status);
  statusRef.current = state.status;

  const me = useMe(api, state.status !== "ANONYMOUS");

  // F-Http calls back regardless of state; M1 accepts these events only while AUTHENTICATED (Artifact 3), so map here.
  useLayoutEffect(() => {
    if (!bridge) return;
    bridge.current = {
      onSessionExpired: () => {
        if (statusRef.current !== "AUTHENTICATED") return;
        dispatch({ type: "sessionExpired" });
        queryClient.clear();
      },
      onRefreshUnavailable: () => {
        if (statusRef.current === "AUTHENTICATED") dispatch({ type: "refreshUnavailable" });
      },
      onRefreshSucceeded: () => {
        if (statusRef.current === "AUTHENTICATED") dispatch({ type: "refreshSucceeded" });
      },
    };
  }, [bridge, queryClient]);

  // Bootstrap probe (SA-01): the first /auth/me decides UNKNOWN -> AUTHENTICATED | ANONYMOUS | retry screen.
  useEffect(() => {
    if (statusRef.current !== "UNKNOWN") return;
    if (me.status === "success") {
      dispatch({ type: "meSucceeded" });
    } else if (me.status === "error") {
      const err = me.error;
      const unauthorized = err instanceof ApiError && (err.code === "SESSION_EXPIRED" || err.status === 401);
      dispatch({ type: unauthorized ? "meUnauthorized" : "meFailedTransient" });
    }
  }, [me.status, me.errorUpdatedAt, me.error]);

  const retryBootstrap = useCallback(() => {
    dispatch({ type: "retryClicked" });
    void me.refetch();
  }, [me]);

  const value = useMemo(
    () => ({ state, dispatch, me: me.data, retryBootstrap }),
    [state, me.data, retryBootstrap],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
