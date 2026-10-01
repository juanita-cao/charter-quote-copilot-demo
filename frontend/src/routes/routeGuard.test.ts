import { routeGuard } from "./routeGuard";

describe("F-Route-Guard (§6.1)", () => {
  test("S01 UNKNOWN + any path -> SPINNER", () => {
    for (const p of ["/workspace", "/login", "/history", "/nope", "/"]) expect(routeGuard("UNKNOWN", p)).toBe("SPINNER");
  });
  test("S02 ANONYMOUS + protected path -> REDIRECT_LOGIN", () => {
    for (const p of ["/workspace", "/history", "/guide", "/"]) expect(routeGuard("ANONYMOUS", p)).toBe("REDIRECT_LOGIN");
  });
  test("S03 AUTHENTICATED + protected path -> RENDER", () => {
    for (const p of ["/workspace", "/history", "/guide", "/"]) expect(routeGuard("AUTHENTICATED", p)).toBe("RENDER");
  });
  test("S04 AUTHENTICATED + /login or /register -> REDIRECT_WORKSPACE", () => {
    expect(routeGuard("AUTHENTICATED", "/login")).toBe("REDIRECT_WORKSPACE");
    expect(routeGuard("AUTHENTICATED", "/register")).toBe("REDIRECT_WORKSPACE");
  });
  test("S05 ANONYMOUS + /login or /register -> RENDER", () => {
    expect(routeGuard("ANONYMOUS", "/login")).toBe("RENDER");
    expect(routeGuard("ANONYMOUS", "/register")).toBe("RENDER");
  });
  test("S06 an unknown path -> REDIRECT_WORKSPACE (for a known session)", () => {
    expect(routeGuard("AUTHENTICATED", "/nope")).toBe("REDIRECT_WORKSPACE");
    expect(routeGuard("ANONYMOUS", "/nope")).toBe("REDIRECT_WORKSPACE");
  });
  test("a trailing slash and a query/hash do not change the decision", () => {
    expect(routeGuard("AUTHENTICATED", "/history/")).toBe("RENDER");
    expect(routeGuard("ANONYMOUS", "/login/")).toBe("RENDER");
    expect(routeGuard("AUTHENTICATED", "/history?x=1#top")).toBe("RENDER");
  });
  test("a path that merely starts with a protected name is unknown, not protected", () => {
    expect(routeGuard("AUTHENTICATED", "/historyx")).toBe("REDIRECT_WORKSPACE");
    expect(routeGuard("AUTHENTICATED", "/login-old")).toBe("REDIRECT_WORKSPACE");
  });
});
