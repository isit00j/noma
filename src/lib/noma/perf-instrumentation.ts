/**
 * TEMPORARY performance instrumentation for the J7 Prime baseline.
 *
 * Purpose: capture a measurement-first baseline (cold launch, startup,
 * Dexie, capture path) with zero product changes. All call sites are tagged
 * `TEMP-PERF`.
 *
 * Removal: set PERF_ENABLED = false (everything becomes a no-op boolean
 * check), then delete this file, `perf-fixture.ts`, `src/routes/perf.tsx`,
 * and revert the `TEMP-PERF` call sites.
 */

export const PERF_ENABLED = true;

export interface PerfMarkEntry {
  name: string;
  /** performance.now() at mark time (ms, monotonic). */
  t: number;
  /** Date.now() at mark time (ms wall clock, for cross-referencing Logcat). */
  wall: number;
}

export interface PerfMeasureSummary {
  name: string;
  count: number;
  medianMs: number;
  minMs: number;
  maxMs: number;
}

const marks: PerfMarkEntry[] = [];
const measures: Array<{ name: string; durationMs: number }> = [];
const extra: Record<string, unknown> = {};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/** Record a timestamped mark. Cheap (~sub-microsecond) when enabled. */
export function pmark(name: string): void {
  if (!PERF_ENABLED) return;
  marks.push({ name, t: performance.now(), wall: Date.now() });
  try {
    performance.mark(`noma:${name}`);
  } catch {
    /* performance.mark is best-effort */
  }
}

/**
 * Mark after the next paint (double rAF). Approximates "rendered to screen"
 * — it fires after the browser has had a chance to paint, not a guarantee.
 *
 * `after` runs after the paint mark is recorded: use it for measures that
 * depend on the paint mark, since measuring synchronously after scheduling
 * would find the mark missing and record nothing.
 */
export function pmarkPaint(name: string, after?: () => void): void {
  if (!PERF_ENABLED) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      pmark(name);
      after?.();
    });
  });
}

function latestMark(name: string): PerfMarkEntry | undefined {
  for (let i = marks.length - 1; i >= 0; i--) {
    if (marks[i]!.name === name) return marks[i];
  }
  return undefined;
}

/**
 * True when mark `name` has a newer latest entry than mark `other`
 * (or when `other` was never marked). Used to attribute editor marks to the
 * New Note flow vs the note-open flow: both mount the same editor, so
 * `new-note-tap-*` measures must not pair a stale `new-note-tap` with fresh
 * marks from a note-open flow.
 */
export function perfNewerThan(name: string, other: string): boolean {
  if (!PERF_ENABLED) return false;
  const a = latestMark(name);
  if (!a) return false;
  const b = latestMark(other);
  return !b || a.t >= b.t;
}

/**
 * Record the duration between the latest `start` and `end` marks.
 * Returns the duration in ms, or null when either mark is missing.
 */
export function pmeasure(name: string, start: string, end: string): number | null {
  if (!PERF_ENABLED) return null;
  const s = latestMark(start);
  const e = latestMark(end);
  if (!s || !e) return null;
  const durationMs = e.t - s.t;
  measures.push({ name, durationMs });
  return durationMs;
}

export function pset(key: string, value: unknown): void {
  if (!PERF_ENABLED) return;
  extra[key] = value;
}

export function summarizeMeasures(): PerfMeasureSummary[] {
  const byName = new Map<string, number[]>();
  for (const m of measures) {
    const list = byName.get(m.name) ?? [];
    list.push(m.durationMs);
    byName.set(m.name, list);
  }
  return [...byName.entries()].map(([name, values]) => ({
    name,
    count: values.length,
    medianMs: Math.round(median(values) * 100) / 100,
    minMs: Math.round(Math.min(...values) * 100) / 100,
    maxMs: Math.round(Math.max(...values) * 100) / 100,
  }));
}

export interface PerfReport {
  enabled: boolean;
  generatedAt: string;
  userAgent: string;
  marks: PerfMarkEntry[];
  measures: PerfMeasureSummary[];
  extra: Record<string, unknown>;
  note: string;
}

export function getPerfReport(): PerfReport {
  return {
    enabled: PERF_ENABLED,
    generatedAt: new Date().toISOString(),
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
    marks: [...marks],
    measures: summarizeMeasures(),
    extra: { ...extra },
    note: "TEMPORARY J7 Prime baseline instrumentation. Marks are performance.now() (monotonic, ms). Wall times are Date.now() for Logcat cross-reference (native anchor: Logcat tag NomaPerf, nativeOnCreate wallMs).",
  };
}

export function resetPerf(): void {
  marks.length = 0;
  measures.length = 0;
  for (const key of Object.keys(extra)) delete extra[key];
}
