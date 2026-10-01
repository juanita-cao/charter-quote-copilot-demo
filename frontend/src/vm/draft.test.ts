import { buildAccountVM, buildDraftBannerVM } from "./draft";

const draft = { route: "A-B", cargo_description: "coal" };

describe("F-VM-Draft", () => {
  test("S01 draft exists, banner SHOWN -> visible", () => {
    const vm = buildDraftBannerVM({ draft, updated_at: "2026-09-19T08:00:00Z" }, "SHOWN");
    expect(vm.visible).toBe(true);
    expect(vm.savedAtIso).toBe("2026-09-19T08:00:00Z");
    expect(vm.values?.route).toBe("A-B");
  });
  test("S02 draft === null -> not visible", () => {
    expect(buildDraftBannerVM({ draft: null, updated_at: null }, "SHOWN")).toEqual({ visible: false, savedAtIso: null, values: null, notice: null });
    expect(buildDraftBannerVM(undefined, "SHOWN").visible).toBe(false);
  });
  test("S03 banner DISMISSED (or HIDDEN) -> not visible", () => {
    expect(buildDraftBannerVM({ draft, updated_at: "x" }, "DISMISSED").visible).toBe(false);
    expect(buildDraftBannerVM({ draft, updated_at: "x" }, "HIDDEN").visible).toBe(false);
  });
  test("an unparsable draft is never offered for Resume", () => {
    expect(buildDraftBannerVM({ draft: "garbage", updated_at: "x" }, "SHOWN")).toMatchObject({ visible: false, values: null });
  });
});

describe("F-VM-Account", () => {
  test("S01 company name present -> label = the name", () => {
    expect(
      buildAccountVM({ user_id: 1, company_id: 2, company_name: "InnerDrive Studio", dashboards_eligible: true }).label,
    ).toBe("InnerDrive Studio");
  });
  test("S02 company_name null or me undefined -> label 'Account'", () => {
    expect(buildAccountVM({ user_id: 1, company_id: 2, company_name: null, dashboards_eligible: false }).label).toBe("Account");
    expect(buildAccountVM(undefined).label).toBe("Account");
  });
});
