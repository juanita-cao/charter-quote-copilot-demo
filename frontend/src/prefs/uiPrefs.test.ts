import { DEFAULT_PREFS, loadUiPrefs, saveUiPrefs, SIDEBAR_KEY, LANGUAGE_KEY } from "./uiPrefs";

function fakeStorage(initial: Record<string, string> = {}): Storage {
  const data = { ...initial };
  return {
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => void (data[k] = v),
    removeItem: (k: string) => void delete data[k],
    clear: () => {},
    key: () => null,
    length: 0,
  } as Storage;
}
const throwing = (): Storage =>
  ({
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  }) as unknown as Storage;

describe("F-Persist-UI", () => {
  test("S01 empty storage -> defaults", () => {
    expect(loadUiPrefs(fakeStorage())).toEqual({ sidebarCollapsed: false, language: "en" });
    expect(DEFAULT_PREFS).toEqual({ sidebarCollapsed: false, language: "en" });
  });
  test("S02 storage access throws -> defaults, no crash (load and save)", () => {
    expect(loadUiPrefs(throwing())).toEqual(DEFAULT_PREFS);
    expect(() => saveUiPrefs({ sidebarCollapsed: true }, throwing())).not.toThrow();
  });
  test("S03 toggling the sidebar is written under cqc.ui.sidebarCollapsed", () => {
    const s = fakeStorage();
    saveUiPrefs({ sidebarCollapsed: true }, s);
    expect(SIDEBAR_KEY).toBe("cqc.ui.sidebarCollapsed");
    expect(s.getItem("cqc.ui.sidebarCollapsed")).toBe("true");
    expect(loadUiPrefs(s).sidebarCollapsed).toBe(true);
  });
  test("the language is written under cqc.ui.language and read back", () => {
    const s = fakeStorage();
    saveUiPrefs({ language: "zh" }, s);
    expect(LANGUAGE_KEY).toBe("cqc.ui.language");
    expect(s.getItem("cqc.ui.language")).toBe("zh");
    expect(loadUiPrefs(s).language).toBe("zh");
  });
  test("saving one preference leaves the other untouched", () => {
    const s = fakeStorage({ "cqc.ui.language": "zh" });
    saveUiPrefs({ sidebarCollapsed: true }, s);
    expect(loadUiPrefs(s)).toEqual({ sidebarCollapsed: true, language: "zh" });
  });
  test("corrupt stored values fall back to the default per field", () => {
    const s = fakeStorage({ "cqc.ui.sidebarCollapsed": "maybe", "cqc.ui.language": "fr" });
    expect(loadUiPrefs(s)).toEqual(DEFAULT_PREFS);
  });
});
