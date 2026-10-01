import { describe, expect, test } from "vitest";
import { buildPortsRecognitionVM } from "./ports";

describe("buildPortsRecognitionVM", () => {
  test("no enquiry text -> empty, no caption (the enquiry-box notice belongs to cargo recognition)", () => {
    expect(buildPortsRecognitionVM(null, [], [])).toEqual({ patch: {}, caption: null });
  });

  test("voyage_ports already has rows, and a fresh proposal agrees with it exactly -> nothing to offer", () => {
    const existing = [
      { port: "Zhuhai", role: "load" as const },
      { port: "Xiamen", role: "discharge" as const },
    ];
    expect(buildPortsRecognitionVM("装港：珠海\n卸港：厦门", existing, [])).toEqual({ patch: {}, caption: null });
  });

  test("voyage_ports already has rows, and the new enquiry finds nothing at all -> kept, not silent (found 2026-09-23: a leftover sequence from an earlier enquiry must say so)", () => {
    const existing = [{ port: "Singapore", role: "load" as const }];
    expect(buildPortsRecognitionVM("这段话里完全没有提到任何港口名称", existing, [])).toEqual({
      patch: {},
      caption: { kind: "warn", key: "portsKept", params: { sequence: "Singapore (Load)" } },
    });
  });

  test("voyage_ports already has rows, and a fresh proposal differs -> offered, never applied automatically (found 2026-09-23)", () => {
    const existing = [{ port: "Singapore", role: "load" as const }];
    expect(buildPortsRecognitionVM("装港：珠海\n卸港：厦门", existing, [])).toEqual({
      patch: {},
      caption: { kind: "offer", key: "portsOffer", params: { sequence: "Zhuhai (Load) → Xiamen (Discharge)" } },
      offerValue: [
        { port: "Zhuhai", role: "load" },
        { port: "Xiamen", role: "discharge" },
      ],
    });
  });

  test("no port recognised -> warn, no patch", () => {
    expect(buildPortsRecognitionVM("这段话里完全没有提到任何港口名称", [], [])).toEqual({
      patch: {},
      caption: { kind: "warn", key: "portsNoMatch" },
    });
  });

  test("a confident 2-port route fills voyage_ports with load/discharge tags", () => {
    expect(buildPortsRecognitionVM("装港：珠海\n卸港：厦门", [], [])).toEqual({
      patch: {
        voyage_ports: [
          { port: "Zhuhai", role: "load" },
          { port: "Xiamen", role: "discharge" },
        ],
      },
      caption: { kind: "ok", key: "portsRecognised", params: { load: "Zhuhai", discharge: "Xiamen" } },
    });
  });

  test("ports found but the order isn't confident: fills untagged waypoint rows, never guesses a role", () => {
    const vm = buildPortsRecognitionVM("大连到秦皇岛到蔚山 8800吨饲料", [], []);
    expect(vm.patch.voyage_ports?.every((p) => p.role === "waypoint")).toBe(true);
    expect(vm.patch.voyage_ports?.map((p) => p.port)).toEqual(["Dalian", "Qinhuangdao Pt", "Ulsan"]);
    expect(vm.caption).toEqual({
      kind: "warn",
      key: "portsFoundUnordered",
      params: { ports: "Dalian, Qinhuangdao Pt, Ulsan" },
    });
  });

  test("includes the caller's custom ports in matching", () => {
    const vm = buildPortsRecognitionVM("装港：珠海\n卸港：Bahodopi", [], ["Bahodopi"]);
    expect(vm.patch.voyage_ports).toEqual([
      { port: "Zhuhai", role: "load" },
      { port: "Bahodopi", role: "discharge" },
    ]);
  });
});
