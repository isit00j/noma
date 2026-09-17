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

/** Monotonic clock for scoping waitForMark to fresh marks. */
export function perfMarkClock(): number {
  return performance.now();
}

function latestMarkAfter(name: string, sinceT: number): PerfMarkEntry | undefined {
  for (let i = marks.length - 1; i >= 0; i--) {
    const m = marks[i]!;
    if (m.name === name && m.t > sinceT) return m;
  }
  return undefined;
}

/**
 * TEMP-PERF automation helper: poll until a fresh mark appears (or time out).
 * Used by the automated benchmark to wait for e.g. tiptap-ready after
 * programmatically opening the editor.
 */
export async function waitForMark(
  name: string,
  timeoutMs: number,
  sinceT = 0,
): Promise<PerfMarkEntry> {
  if (!PERF_ENABLED) throw new Error("perf instrumentation disabled");
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const m = latestMarkAfter(name, sinceT);
    if (m) return m;
    if (Date.now() >= deadline) {
      throw new Error(`perf: timed out waiting for mark "${name}"`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
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

// ---------------------------------------------------------------------------
// TEMP-PERF automated benchmark report.
// ---------------------------------------------------------------------------

export interface PerfAutoEnvironment {
  kind: "device" | "emulator" | "ci";
  label: string;
  userAgent: string;
  /** Hard rule: automated numbers are preliminary, never J7 Prime numbers. */
  warning: string;
}

export function makeAutoEnv(kind: "device" | "emulator" | "ci"): PerfAutoEnvironment {
  return {
    kind,
    label:
      kind === "emulator"
        ? "Android emulator — PRELIMINARY, not a J7 Prime"
        : kind === "ci"
          ? "CI headless Chromium (Linux) — PRELIMINARY smoke numbers, not a J7 Prime"
          : "Physical device (manual run)",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
    warning:
      "Automated measurements are preliminary smoke numbers only and must never be presented as J7 Prime measurements.",
  };
}

export interface PerfDeviceOnlyMetric {
  metric: string;
  status: "not-measured";
  source: "device-only";
  howTo: string;
}

/**
 * Metrics that genuinely need a human and/or physical device. They are
 * optional validation — the automated benchmark never requires them.
 */
export const DEVICE_ONLY_METRICS: PerfDeviceOnlyMetric[] = [
  {
    metric: "Cold launch: launcher icon tap → native MainActivity.onCreate",
    status: "not-measured",
    source: "device-only",
    howTo:
      "Optional. Force-stop Noma, tap the icon, and capture 'adb logcat -s NomaPerf'; correlate nativeOnCreate wallMs with the js-bundle-start wall time in the report. The automated report already includes warm-start (JS) timings.",
  },
  {
    metric: "Tap → first focus → keyboard visible → first keystroke painted",
    status: "not-measured",
    source: "device-only",
    howTo:
      "Optional. Tap New Note, tap the note body, type a word, then open /perf and copy the report — the capture marks (editor-first-focus, keyboard-visible, first-keydown, first-content-update, first-keystroke-painted) are recorded automatically.",
  },
  {
    metric: "Frame / jank behaviour during fast list fling",
    status: "not-measured",
    source: "device-only",
    howTo:
      "Optional. 60fps screen recording while flinging the note list with the 2,000-note fixture.",
  },
  {
    metric: "True display / render timing (frame-accurate)",
    status: "not-measured",
    source: "device-only",
    howTo:
      "Optional. Screen-recording analysis only — the in-app 'painted' marks are double-requestAnimationFrame approximations, not frame-accurate.",
  },
];

export interface PerfAutoDexie {
  count: number;
  toArray: number;
  indexedFolderQuery: number;
  recentSlice50: number;
  put: number;
  update: number;
  delete: number;
}

export interface PerfAutoSizeResult {
  fixture: { generationMs: number; notes: number; attachments: number };
  /** Representative Dexie timings (ms). */
  dexie: PerfAutoDexie;
  dexieNoteCount: number;
  search: { query: string; ms: number; hits: number }[];
  save: { createMs: number; updateMs: number[] };
  editor:
    | {
        tapToCreatedMs: number;
        tapToEditorMountedMs: number;
        tapToTiptapReadyMs: number;
        tapToEditorPaintedMs: number;
      }
    | { failed: string };
  listRender: { fixtureToListPaintedMs: number } | { failed: string };
}

export interface PerfAutoReport {
  schema: "noma-perf-auto/1";
  generatedAt: string;
  branch: "chore/perf-baseline";
  environment: PerfAutoEnvironment;
  automated: {
    /** Warm-start measures captured from the current session (JS only). */
    startup: Record<string, number>;
    sizes: Record<string, PerfAutoSizeResult>;
  };
  deviceOnly: PerfDeviceOnlyMetric[];
  notes: string[];
}

/** The most recent automated benchmark report (module-level, temporary). */
let lastAutoReport: PerfAutoReport | null = null;

export function setLastAutoReport(report: PerfAutoReport | null): void {
  lastAutoReport = report;
  // TEMP-PERF: expose the report on window so the headless-CI driver can
  // extract it without touching React state.
  if (typeof window !== "undefined") {
    (window as unknown as { __nomaPerfReport?: PerfAutoReport | null }).__nomaPerfReport = report;
  }
}

export function getLastAutoReport(): PerfAutoReport | null {
  return lastAutoReport;
}
