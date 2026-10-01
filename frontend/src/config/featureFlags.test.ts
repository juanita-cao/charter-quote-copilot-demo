import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { computeUseMock, USE_MOCK } from "./featureFlags";

describe("F-Flags (mock safeguards, Artifact 6)", () => {
  test("S01 USE_MOCK is false in a production build even with VITE_USE_MOCK=1 in the environment", () => {
    expect(computeUseMock({ DEV: false, VITE_USE_MOCK: "1" })).toBe(false);
  });
  test("USE_MOCK is on only for a dev build with the flag exactly '1'", () => {
    expect(computeUseMock({ DEV: true, VITE_USE_MOCK: "1" })).toBe(true);
    expect(computeUseMock({ DEV: true, VITE_USE_MOCK: "true" })).toBe(false);
    expect(computeUseMock({ DEV: true, VITE_USE_MOCK: "0" })).toBe(false);
    expect(computeUseMock({ DEV: true })).toBe(false);
  });
  test("the flag defaults off in the test environment (production-safe default)", () => {
    expect(USE_MOCK).toBe(false);
  });
  test("S02 a production build with VITE_USE_MOCK=1 FAILS", () => {
    let failed = false;
    let output = "";
    try {
      execFileSync("npx", ["vite", "build", "--mode", "production", "--outDir", "dist-flagcheck"], {
        cwd: process.cwd(),
        env: { ...process.env, VITE_USE_MOCK: "1" },
        stdio: "pipe",
        timeout: 60_000,
      });
    } catch (e) {
      failed = true;
      output = String((e as { stderr?: Buffer }).stderr ?? "") + String((e as { stdout?: Buffer }).stdout ?? "");
    }
    expect(failed).toBe(true);
    expect(output).toContain("VITE_USE_MOCK=1 is not allowed");
  }, 90_000);

  test("S03 the built production bundle contains no MSW or mock-handler code", () => {
    const outDir = "dist-s03check";
    rmSync(outDir, { recursive: true, force: true });
    try {
      execFileSync("npx", ["vite", "build", "--mode", "production", "--outDir", outDir], {
        cwd: process.cwd(),
        env: { ...process.env, VITE_USE_MOCK: "" },
        stdio: "pipe",
        timeout: 120_000,
      });
      const files: string[] = [];
      const walk = (dir: string) =>
        readdirSync(dir).forEach((name) => {
          const full = join(dir, name);
          statSync(full).isDirectory() ? walk(full) : files.push(full);
        });
      walk(outDir);
      expect(files.length).toBeGreaterThan(0);
      expect(files.some((f) => f.endsWith("mockServiceWorker.js"))).toBe(false);
      expect(existsSync(join(outDir, "mockServiceWorker.js"))).toBe(false);

      // Strings that exist only in mock/MSW code (the MOCK banner component itself is harmless UI and not searched for).
      const forbidden = ["mockServiceWorker", "setupWorker", "cqc.mock.authed", "MOCK_CALC_GO", "Acme Shipping", "wrong@example.com", "@mswjs"];
      const text = files.filter((f) => /\.(js|html|css|json)$/.test(f)).map((f) => readFileSync(f, "utf8")).join("\n");
      for (const needle of forbidden) expect(text.includes(needle), `production bundle contains "${needle}"`).toBe(false);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 180_000);
});
