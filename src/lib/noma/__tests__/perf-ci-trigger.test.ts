/**
 * TEMPORARY regression tests: CI trigger parsing (?autoperf=1&env=ci) and
 * the window.__nomaPerfReport exposure the headless-CI driver extracts.
 * Delete with src/lib/noma/__tests__ when the baseline is done.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeAutoEnv, setLastAutoReport, getLastAutoReport } from "../perf-instrumentation";
import { autoBenchmarkQueryParam } from "../perf-automation";

vi.mock("@capacitor/local-notifications", () => ({ LocalNotifications: {} }));

function setSearch(search: string): void {
  (globalThis as Record<string, unknown>)["window"] = { location: { search } };
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>)["window"];
  setLastAutoReport(null);
});

describe("CI trigger query param", () => {
  it("returns null without a window", () => {
    expect(autoBenchmarkQueryParam()).toBeNull();
  });

  it("parses ?autoperf=1&env=ci into a ci environment", () => {
    setSearch("?autoperf=1&env=ci");
    const env = autoBenchmarkQueryParam();
    expect(env).not.toBeNull();
    expect(env?.kind).toBe("ci");
    expect(env?.label).toContain("PRELIMINARY");
    expect(env?.label).toContain("not a J7 Prime");
    expect(env?.warning).toContain("never be presented as J7 Prime measurements");
  });

  it("keeps the emulator environment working", () => {
    setSearch("?autoperf=1&env=emulator");
    expect(autoBenchmarkQueryParam()?.kind).toBe("emulator");
  });

  it("defaults to device for any other env value", () => {
    setSearch("?autoperf=1&env=something-else");
    expect(autoBenchmarkQueryParam()?.kind).toBe("device");
  });

  it("returns null when autoperf is not requested", () => {
    setSearch("?env=ci");
    expect(autoBenchmarkQueryParam()).toBeNull();
  });

  it("makeAutoEnv labels never claim J7 Prime numbers", () => {
    for (const kind of ["device", "emulator", "ci"] as const) {
      const env = makeAutoEnv(kind);
      expect(env.warning.toLowerCase()).toContain("never");
    }
  });
});

describe("window report exposure", () => {
  it("setLastAutoReport publishes the report on window for CI extraction", () => {
    (globalThis as Record<string, unknown>)["window"] = {};
    const report = { automated: { sizes: {} } } as never;
    setLastAutoReport(report);
    expect(getLastAutoReport()).toBe(report);
    expect(
      (globalThis as Record<string, unknown>)["window"] as Record<string, unknown>,
    ).toMatchObject({ __nomaPerfReport: report });
  });
});
