/**
 * TEMPORARY regression tests for the perf instrumentation module.
 * Delete with src/lib/noma/__tests__ when the baseline is done.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PERF_ENABLED,
  perfMarkClock,
  perfNewerThan,
  pmark,
  pmarkPaint,
  pmeasure,
  resetPerf,
  summarizeMeasures,
  waitForMark,
} from "../perf-instrumentation";

beforeEach(() => {
  resetPerf();
  vi.unstubAllGlobals();
});

describe("perf instrumentation", () => {
  it("records marks and computes measures between latest marks", () => {
    expect(PERF_ENABLED).toBe(true);
    pmark("a");
    pmark("b");
    const ms = pmeasure("a-to-b", "a", "b");
    expect(ms).not.toBeNull();
    expect(ms!).toBeGreaterThanOrEqual(0);
    expect(ms!).toBeLessThan(1000);
  });

  it("returns null when either mark is missing", () => {
    expect(pmeasure("x-to-y", "x", "y")).toBeNull();
    pmark("x");
    expect(pmeasure("x-to-y", "x", "y")).toBeNull();
  });

  it("summarizes measures with median/min/max/count", () => {
    pmark("s1");
    pmark("e1");
    pmeasure("m", "s1", "e1");
    pmark("s2");
    pmark("e2");
    pmeasure("m", "s2", "e2");
    const summary = summarizeMeasures().find((s) => s.name === "m");
    expect(summary).toBeDefined();
    expect(summary!.count).toBe(2);
    expect(summary!.medianMs).toBeGreaterThanOrEqual(0);
    expect(summary!.minMs).toBeLessThanOrEqual(summary!.medianMs);
    expect(summary!.maxMs).toBeGreaterThanOrEqual(summary!.medianMs);
  });

  it("resetPerf clears marks and measures", () => {
    pmark("a");
    pmark("b");
    pmeasure("a-to-b", "a", "b");
    resetPerf();
    expect(summarizeMeasures()).toHaveLength(0);
    expect(pmeasure("a-to-b", "a", "b")).toBeNull();
  });

  it("perfNewerThan attributes flows correctly", () => {
    expect(perfNewerThan("new-note-tap", "note-open-tap")).toBe(false);
    pmark("new-note-tap");
    // No note-open-tap: new-note flow wins.
    expect(perfNewerThan("new-note-tap", "note-open-tap")).toBe(true);
    pmark("note-open-tap");
    // Stale new-note-tap must not win over a fresh note-open-tap.
    expect(perfNewerThan("new-note-tap", "note-open-tap")).toBe(false);
    pmark("new-note-tap");
    expect(perfNewerThan("new-note-tap", "note-open-tap")).toBe(true);
  });

  it("pmarkPaint records the mark before running the callback", async () => {
    vi.stubGlobal(
      "requestAnimationFrame",
      (cb: FrameRequestCallback) => setTimeout(() => cb(16), 0) as unknown as number,
    );
    pmark("start");
    let measured: number | null = null;
    await new Promise<void>((resolve) => {
      pmarkPaint("painted", () => {
        // The paint mark must already exist when the callback runs.
        measured = pmeasure("start-to-painted", "start", "painted");
        resolve();
      });
    });
    expect(measured).not.toBeNull();
    expect(measured!).toBeGreaterThanOrEqual(0);
  });

  it("waitForMark resolves for a fresh mark and times out otherwise", async () => {
    const t0 = perfMarkClock();
    setTimeout(() => pmark("late-mark"), 100);
    const mark = await waitForMark("late-mark", 5000, t0);
    expect(mark.name).toBe("late-mark");
    expect(mark.t).toBeGreaterThan(t0);

    // A mark recorded before sinceT must not satisfy the wait.
    pmark("old-mark");
    await expect(waitForMark("old-mark", 200, perfMarkClock())).rejects.toThrow(/timed out/);
  });
});
