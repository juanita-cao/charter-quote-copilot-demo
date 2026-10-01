export type AuthStatus = "UNKNOWN" | "AUTHENTICATED" | "ANONYMOUS";

export interface AuthState {
  status: AuthStatus;
  bootstrapError: boolean;
  sessionExpired: boolean;
  authUnavailable: boolean;
}

export type AuthEvent =
  | { type: "meSucceeded" }
  | { type: "meUnauthorized" }
  | { type: "meFailedTransient" }
  | { type: "retryClicked" }
  | { type: "loginSucceeded" }
  | { type: "registerSucceeded" }
  | { type: "loginFailed" }
  | { type: "logoutSucceeded" }
  | { type: "logoutFailed" }
  | { type: "sessionExpired" }
  | { type: "refreshUnavailable" }
  | { type: "refreshSucceeded" };

export const initialAuthState: AuthState = {
  status: "UNKNOWN",
  bootstrapError: false,
  sessionExpired: false,
  authUnavailable: false,
};

const illegal = (state: AuthState, event: AuthEvent): never => {
  throw new Error(`authReducer: illegal event ${event.type} in state ${state.status}`);
};

export function authReducer(state: AuthState, event: AuthEvent): AuthState {
  switch (state.status) {
    case "UNKNOWN":
      switch (event.type) {
        case "meSucceeded": // A-01
          return { ...state, status: "AUTHENTICATED", bootstrapError: false };
        case "meUnauthorized": // A-02
          return { ...state, status: "ANONYMOUS", bootstrapError: false };
        case "meFailedTransient": // A-03
          return { ...state, bootstrapError: true };
        case "retryClicked": // A-04
          return state.bootstrapError ? { ...state, bootstrapError: false } : illegal(state, event);
        default:
          return illegal(state, event);
      }
    case "ANONYMOUS":
      switch (event.type) {
        case "loginSucceeded": // A-05
          return { ...state, status: "AUTHENTICATED", sessionExpired: false };
        case "registerSucceeded": // A-06
        case "loginFailed": // A-07
          return state;
        default:
          return illegal(state, event);
      }
    case "AUTHENTICATED":
      switch (event.type) {
        case "logoutSucceeded": // A-08
          return { ...state, status: "ANONYMOUS", authUnavailable: false };
        case "logoutFailed": // A-09
          return state;
        case "sessionExpired": // A-10
          return { ...state, status: "ANONYMOUS", sessionExpired: true, authUnavailable: false };
        case "refreshUnavailable": // A-11
          return { ...state, authUnavailable: true };
        case "refreshSucceeded": // A-12
          return { ...state, authUnavailable: false };
        default:
          return illegal(state, event);
      }
  }
}
