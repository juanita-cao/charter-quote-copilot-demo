import { describe, expect, test } from "vitest";
import { searchCargoPorts } from "./cargoPorts";

// The standard port list (v1.2, design_problem.md PT-18 follow-up): the bundled UN/LOCODE seaport list plus, for
// eligible companies, a server-provided list of real trading points with no official code (custom ports).

describe("searchCargoPorts", () => {
  test("matches a standard port by name, case-insensitively", () => {
    expect(searchCargoPorts("qingd", [])).toContain("Qingdao");
    expect(searchCargoPorts("QINGD", [])).toContain("Qingdao");
  });

  test("an old spelling still finds the standard port (alias), client decision 2026-09-22", () => {
    expect(searchCargoPorts("kunsan", [])).toContain("Gunsan");
    expect(searchCargoPorts("kunsan", [])).not.toContain("Kunsan");
  });

  test("blank input returns no suggestions", () => {
    expect(searchCargoPorts("", [])).toEqual([]);
    expect(searchCargoPorts("   ", [])).toEqual([]);
  });

  test("results are capped, so a common substring does not flood the dropdown", () => {
    const results = searchCargoPorts("a", []);
    expect(results.length).toBeLessThanOrEqual(20);
  });

  test("a port with more than one matching alias still appears once", () => {
    // "Port Kelang" and "Portkelang" are both aliases of the same standard entry (Port Klang, Malaysia)
    const results = searchCargoPorts("kelang", []);
    expect(results.filter((r) => r.toLowerCase().includes("klang")).length).toBe(1);
  });

  test("custom ports (company-scoped, no standard entry) are searched alongside the standard list", () => {
    expect(searchCargoPorts("bahodopi", ["Bahodopi", "Kampot"])).toContain("Bahodopi");
    expect(searchCargoPorts("bahodopi", [])).not.toContain("Bahodopi");
  });

  test("no match returns an empty list, not an error", () => {
    expect(searchCargoPorts("zzznotaport", [])).toEqual([]);
  });
});
