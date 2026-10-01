import "@testing-library/jest-dom/vitest";

// Pure-logic tests (e.g. the contract tests) run in the node environment, which has no window: nothing to patch there.
const inBrowserLikeEnvironment = typeof window !== "undefined";

// Node 26 ships an experimental global `localStorage` that shadows jsdom's; when it is unusable, install an in-memory one.
function usable(): boolean {
  try {
    return typeof window.localStorage?.getItem === "function";
  } catch {
    return false;
  }
}

if (inBrowserLikeEnvironment && !usable()) {
  const data = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => (data.has(k) ? (data.get(k) as string) : null),
    key: (i) => Array.from(data.keys())[i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
  Object.defineProperty(window, "localStorage", { value: storage, configurable: true });
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
}

// jsdom has no matchMedia, which Ant Design's grid needs; default to "no query matches" (a wide screen).
if (inBrowserLikeEnvironment && typeof window.matchMedia !== "function") {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}
