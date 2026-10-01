import type { AuthStatus } from "../state/authMachine";

export type RouteDecision = "SPINNER" | "RENDER" | "REDIRECT_LOGIN" | "REDIRECT_WORKSPACE";

const PROTECTED = new Set(["/", "/workspace", "/history", "/dashboards", "/guide"]);
const ANONYMOUS_ONLY = new Set(["/login", "/register"]);

function normalize(path: string): string {
  const bare = path.split(/[?#]/)[0];
  return bare.length > 1 ? bare.replace(/\/+$/, "") : bare;
}

export function routeGuard(status: AuthStatus, path: string): RouteDecision {
  if (status === "UNKNOWN") return "SPINNER";
  const p = normalize(path);
  if (PROTECTED.has(p)) return status === "AUTHENTICATED" ? "RENDER" : "REDIRECT_LOGIN";
  if (ANONYMOUS_ONLY.has(p)) return status === "AUTHENTICATED" ? "REDIRECT_WORKSPACE" : "RENDER";
  return "REDIRECT_WORKSPACE";
}
