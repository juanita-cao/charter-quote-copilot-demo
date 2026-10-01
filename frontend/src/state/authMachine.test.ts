import { authReducer, initialAuthState, type AuthState, type AuthEvent } from "./authMachine";

const st = (over: Partial<AuthState> = {}): AuthState => ({ ...initialAuthState, ...over });
const unknown = (over: Partial<AuthState> = {}) => st({ status: "UNKNOWN", ...over });
const authed = (over: Partial<AuthState> = {}) => st({ status: "AUTHENTICATED", ...over });
const anon = (over: Partial<AuthState> = {}) => st({ status: "ANONYMOUS", ...over });

describe("F-State-Auth reducer (Artifact 3, A-01…A-12)", () => {
  test("initial state: UNKNOWN, no flags", () => {
    expect(initialAuthState).toEqual({
      status: "UNKNOWN",
      bootstrapError: false,
      sessionExpired: false,
      authUnavailable: false,
    });
  });

  test("S01 A-01 UNKNOWN + meSucceeded -> AUTHENTICATED, bootstrapError cleared", () => {
    expect(authReducer(unknown({ bootstrapError: true }), { type: "meSucceeded" })).toEqual(authed());
    expect(authReducer(unknown(), { type: "meSucceeded" })).toEqual(authed());
  });
  test("S02 A-02 UNKNOWN + meUnauthorized -> ANONYMOUS, bootstrapError cleared", () => {
    expect(authReducer(unknown({ bootstrapError: true }), { type: "meUnauthorized" })).toEqual(anon());
  });
  test("S03 A-03 UNKNOWN + meFailedTransient -> UNKNOWN with bootstrapError", () => {
    expect(authReducer(unknown(), { type: "meFailedTransient" })).toEqual(unknown({ bootstrapError: true }));
  });
  test("S04 A-04 UNKNOWN(bootstrapError) + retryClicked -> UNKNOWN, bootstrapError cleared", () => {
    expect(authReducer(unknown({ bootstrapError: true }), { type: "retryClicked" })).toEqual(unknown());
  });
  test("S04 A-04 guard: retryClicked without bootstrapError throws", () => {
    expect(() => authReducer(unknown(), { type: "retryClicked" })).toThrow();
  });
  test("S05 A-05 ANONYMOUS + loginSucceeded -> AUTHENTICATED, sessionExpired cleared", () => {
    expect(authReducer(anon({ sessionExpired: true }), { type: "loginSucceeded" })).toEqual(authed());
  });
  test("S06 A-06 ANONYMOUS + registerSucceeded -> unchanged", () => {
    expect(authReducer(anon(), { type: "registerSucceeded" })).toEqual(anon());
    expect(authReducer(anon({ sessionExpired: true }), { type: "registerSucceeded" })).toEqual(
      anon({ sessionExpired: true }),
    );
  });
  test("S07 A-07 ANONYMOUS + loginFailed -> unchanged", () => {
    expect(authReducer(anon(), { type: "loginFailed" })).toEqual(anon());
    expect(authReducer(anon({ sessionExpired: true }), { type: "loginFailed" })).toEqual(
      anon({ sessionExpired: true }),
    );
  });
  test("S08 A-08 AUTHENTICATED + logoutSucceeded -> ANONYMOUS, authUnavailable cleared", () => {
    expect(authReducer(authed({ authUnavailable: true }), { type: "logoutSucceeded" })).toEqual(anon());
  });
  test("S09 A-09 AUTHENTICATED + logoutFailed -> unchanged (nothing cleared)", () => {
    expect(authReducer(authed(), { type: "logoutFailed" })).toEqual(authed());
    expect(authReducer(authed({ authUnavailable: true }), { type: "logoutFailed" })).toEqual(
      authed({ authUnavailable: true }),
    );
  });
  test("S10 A-10 AUTHENTICATED + sessionExpired -> ANONYMOUS with sessionExpired, authUnavailable cleared", () => {
    expect(authReducer(authed({ authUnavailable: true }), { type: "sessionExpired" })).toEqual(
      anon({ sessionExpired: true }),
    );
  });
  test("S11 A-11 AUTHENTICATED + refreshUnavailable -> stays AUTHENTICATED, authUnavailable set (not expired)", () => {
    const next = authReducer(authed(), { type: "refreshUnavailable" });
    expect(next).toEqual(authed({ authUnavailable: true }));
    expect(next.sessionExpired).toBe(false);
    expect(authReducer(next, { type: "refreshUnavailable" })).toEqual(next);
  });
  test("S12 A-12 AUTHENTICATED + refreshSucceeded -> authUnavailable cleared", () => {
    expect(authReducer(authed({ authUnavailable: true }), { type: "refreshSucceeded" })).toEqual(authed());
    expect(authReducer(authed(), { type: "refreshSucceeded" })).toEqual(authed());
  });

  test("S99 unlisted pairs throw", () => {
    const cases: [AuthState, AuthEvent][] = [
      [anon(), { type: "meSucceeded" }],
      [authed(), { type: "meSucceeded" }],
      [authed(), { type: "meUnauthorized" }],
      [anon(), { type: "meFailedTransient" }],
      [authed(), { type: "loginSucceeded" }],
      [unknown(), { type: "loginSucceeded" }],
      [authed(), { type: "registerSucceeded" }],
      [anon(), { type: "logoutSucceeded" }],
      [unknown(), { type: "logoutSucceeded" }],
      [anon(), { type: "logoutFailed" }],
      [anon(), { type: "sessionExpired" }],
      [unknown(), { type: "sessionExpired" }],
      [anon(), { type: "refreshUnavailable" }],
      [unknown(), { type: "refreshSucceeded" }],
      [anon(), { type: "refreshSucceeded" }],
      [authed(), { type: "retryClicked" }],
    ];
    for (const [s, e] of cases) expect(() => authReducer(s, e)).toThrow();
  });
});
