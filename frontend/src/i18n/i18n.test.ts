import { changeLanguage, createI18n } from "./index";
import { en } from "./en";
import { zh } from "./zh";
import type { FieldHint } from "../form/fieldRules";
import { LANGUAGE_KEY, loadUiPrefs } from "../prefs/uiPrefs";

function fakeStorage(initial: Record<string, string> = {}): Storage {
  const data = { ...initial };
  return {
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => void (data[k] = v),
  } as Storage;
}

const flatten = (obj: Record<string, unknown>, prefix = ""): string[] =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? flatten(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
  );

const HINTS: Record<FieldHint, true> = {
  mustBeANumber: true,
  mustBeGreaterThanZero: true,
  mustBeAtLeastZero: true,
  mustBeBetween0And100: true,
  mustBeWholeNumber: true,
  laycanOrder: true,
};

describe("F-I18n", () => {
  test("S01 switching to zh changes the text and persists the preference", async () => {
    const storage = fakeStorage();
    const i18n = await createI18n("en");
    expect(i18n.t("hints.mustBeGreaterThanZero")).toBe(en.hints.mustBeGreaterThanZero);
    await changeLanguage(i18n, "zh", storage);
    expect(i18n.language).toBe("zh");
    expect(i18n.t("hints.mustBeGreaterThanZero")).toBe(zh.hints.mustBeGreaterThanZero);
    expect(zh.hints.mustBeGreaterThanZero).not.toBe(en.hints.mustBeGreaterThanZero);
    expect(storage.getItem(LANGUAGE_KEY)).toBe("zh");
  });

  test("the saved preference is what the app starts in", async () => {
    const storage = fakeStorage({ [LANGUAGE_KEY]: "zh" });
    const i18n = await createI18n(loadUiPrefs(storage).language);
    expect(i18n.language).toBe("zh");
  });

  test("an unwritable storage does not stop the language from switching (SOFT)", async () => {
    const throwing = { setItem: () => { throw new Error("blocked"); } } as unknown as Storage;
    const i18n = await createI18n("en");
    await expect(changeLanguage(i18n, "zh", throwing)).resolves.toBeUndefined();
    expect(i18n.language).toBe("zh");
  });

  test("the English and Chinese catalogs have exactly the same keys (nothing untranslated)", () => {
    expect(flatten(zh).sort()).toEqual(flatten(en).sort());
  });

  test("every field-hint key that F-Field-Rules can return has a text in both languages", async () => {
    const i18n = await createI18n("en");
    for (const key of Object.keys(HINTS)) {
      for (const lng of ["en", "zh"] as const) {
        await i18n.changeLanguage(lng);
        const text = i18n.t(`hints.${key}`);
        expect(text).not.toBe(`hints.${key}`);
        expect(text.trim()).not.toBe("");
      }
    }
  });

  test("the bunker captions interpolate their parameters in both languages", async () => {
    const i18n = await createI18n("en");
    expect(i18n.t("bunker.stale", { date: "2026-09-10", days: "10" })).toContain("10");
    expect(i18n.t("bunker.stale", { date: "2026-09-10", days: "10" })).toContain("2026-09-10");
    await i18n.changeLanguage("zh");
    expect(i18n.t("bunker.stale", { date: "2026-09-10", days: "10" })).toContain("10");
    for (const key of ["ok", "noData", "nil", "stale", "lowConfidence"]) {
      expect(i18n.t(`bunker.${key}`, { date: "d", days: "1" })).not.toBe(`bunker.${key}`);
    }
  });

  test("two i18n instances do not share a language (no global state leaks between tests / users)", async () => {
    const a = await createI18n("en");
    const b = await createI18n("zh");
    expect(a.language).toBe("en");
    expect(b.language).toBe("zh");
  });
});
