import { describe, expect, test } from "vitest";
import { buildBallastDistanceVM, buildLadenDistanceVM, type DistanceLeg } from "./distance";

describe("buildLadenDistanceVM", () => {
  test("no legs (load or discharge not tagged yet): nothing", () => {
    expect(buildLadenDistanceVM([])).toEqual({ patch: {}, caption: null });
  });

  test("still loading: no patch, no caption", () => {
    const legs: DistanceLeg[] = [{ a: "Dalian", b: "Gunsan", result: undefined }];
    expect(buildLadenDistanceVM(legs)).toEqual({ patch: {}, caption: null });
  });

  test("no history for the pair: clears laden_distance (never leaves a stale number), names the missing leg", () => {
    const legs: DistanceLeg[] = [{ a: "Dalian", b: "Gunsan", result: null }];
    const vm = buildLadenDistanceVM(legs);
    expect(vm.patch).toEqual({ laden_distance: null });
    expect(vm.caption).toEqual({ kind: "warn", key: "distanceMissingLegs", params: { legs: "Dalian → Gunsan" } });
  });

  test("a direct load -> discharge match fills laden_distance silently (no caption, client feedback 2026-09-22)", () => {
    const legs: DistanceLeg[] = [{ a: "Dalian", b: "Gunsan", result: { nm: 303, samples: 65, source: "history" } }];
    const vm = buildLadenDistanceVM(legs);
    expect(vm.patch).toEqual({ laden_distance: 303 });
    expect(vm.caption).toBeNull();
  });

  test("a stop between load and discharge sums both legs", () => {
    const legs: DistanceLeg[] = [
      { a: "Vostochny", b: "CJK", result: { nm: 100, samples: 2, source: "history" } },
      { a: "CJK", b: "Nantong", result: { nm: 50, samples: 4, source: "history" } },
    ];
    const vm = buildLadenDistanceVM(legs);
    expect(vm.patch).toEqual({ laden_distance: 150 });
  });
});

describe("buildBallastDistanceVM", () => {
  test("no legs (no waypoints, no load port yet): nothing", () => {
    expect(buildBallastDistanceVM([])).toEqual({ patch: {}, caption: null });
  });

  test("any leg still loading: nothing yet, not a partial guess", () => {
    const legs: DistanceLeg[] = [
      { a: "Busan", b: "Vostochny", result: { nm: 507, samples: 3, source: "history" } },
      { a: "Vostochny", b: "Tianjin", result: undefined },
    ];
    expect(buildBallastDistanceVM(legs)).toEqual({ patch: {}, caption: null });
  });

  test("one leg has no history: clears ballast_distance, caption names which leg", () => {
    const legs: DistanceLeg[] = [
      { a: "Busan", b: "Vostochny", result: { nm: 507, samples: 3, source: "history" } },
      { a: "Vostochny", b: "Tianjin", result: null },
    ];
    const vm = buildBallastDistanceVM(legs);
    expect(vm.patch).toEqual({ ballast_distance: null });
    expect(vm.caption).toEqual({ kind: "warn", key: "distanceMissingLegs", params: { legs: "Vostochny → Tianjin" } });
  });

  test("every leg resolves: fills the sum silently (no caption)", () => {
    const legs: DistanceLeg[] = [
      { a: "Busan", b: "Vostochny", result: { nm: 507, samples: 3, source: "history" } },
      { a: "Vostochny", b: "Tianjin", result: { nm: 1222, samples: 40, source: "history" } },
    ];
    const vm = buildBallastDistanceVM(legs);
    expect(vm.patch).toEqual({ ballast_distance: 1729 });
    expect(vm.caption).toBeNull();
  });

  test("a single-leg chain (no waypoints, just previous->load) works the same way", () => {
    const legs: DistanceLeg[] = [{ a: "Busan", b: "Vostochny", result: { nm: 507, samples: 3, source: "history" } }];
    expect(buildBallastDistanceVM(legs).patch).toEqual({ ballast_distance: 507 });
  });
});
