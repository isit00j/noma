/**
 * TEMP-PERF automated benchmark runner (J7 Prime baseline).
 *
 * One tap ("Run Performance Benchmark") executes everything measurable
 * without human interaction: fixture generation for 100/500/2000 notes,
 * Dexie micro-benchmarks, search computation, save/write timing, editor
 * mount + Tiptap readiness (driven programmatically through the same code
 * path as the New Note button), and a list-render probe.
 *
 * Human/device-only metrics (cold launch icon tap, tap→focus→keyboard→
 * keystroke, frame jank, frame-accurate render timing) are NOT automated;
 * they are listed in the report under `deviceOnly` as optional validation.
 *
 * Delete with `perf-instrumentation.ts` when the baseline is done.
 */

import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import {
  DEVICE_ONLY_METRICS,
  getPerfReport,
  makeAutoEnv,
  perfMarkClock,
  pmark,
  pmarkPaint,
  pmeasure,
  resetPerf,
  setLastAutoReport,
  waitForMark,
  type PerfAutoDexie,
  type PerfAutoEnvironment,
  type PerfAutoReport,
  type PerfAutoSizeResult,
} from "./perf-instrumentation";
import { generateFixture, runDexieBench } from "./perf-fixture";
import { createNote, updateNote } from "./notes";
import { searchNotes } from "./search";
import type { NomaDatabase } from "./db";

/** Sizes exercised by the automated benchmark. */
export const AUTO_BENCHMARK_SIZES = [100, 500, 2000] as const;

const round = (n: number): number => Math.round(n * 100) / 100;

/** Driver implemented by the workspace (the automation runs in its context). */
export interface AutoBenchmarkDriver {
  db: NomaDatabase;
  env: PerfAutoEnvironment;
  onProgress(step: string): void;
  /** Live-query note count mirror (for the list-render probe). */
  getNotesCount(): number;
  /**
   * Create a note exactly like the New Note button does and open it in the
   * editor. Returns the note id. Marks new-note-tap / new-note-created.
   */
  openNewNoteInEditor(): Promise<string>;
  /** Return to the list (flushes any pending save). */
  closeEditor(): Promise<void>;
  deleteNoteById(id: string): Promise<void>;
}

async function pollFor(cond: () => boolean, timeoutMs: number, label: string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/**
 * Paint probe with a timeout. requestAnimationFrame can stall indefinitely
 * (backgrounded WebView, throttled renderer), so never await it unbounded —
 * fail open and keep the benchmark moving.
 */
async function paintProbeMs(
  label: string,
  markName: string,
  measureName: string,
  fromMark: string,
  timeoutMs = 15000,
): Promise<number> {
  const ms = await Promise.race([
    new Promise<number>((resolve) => {
      pmarkPaint(markName, () => {
        pmeasure(measureName, fromMark, markName);
        const v = measureLookup().get(measureName);
        resolve(v === undefined ? Number.NaN : v);
      });
    }),
    new Promise<number>((resolve) => setTimeout(() => resolve(Number.NaN), timeoutMs)),
  ]);
  if (Number.isNaN(ms)) throw new Error(`timed out waiting for ${label} paint`);
  return ms;
}

function measureLookup(): Map<string, number> {
  const map = new Map<string, number>();
  for (const m of getPerfReport().measures) map.set(m.name, m.medianMs);
  return map;
}

const SEARCH_QUERIES = ["note", "perf-tag-3", "morning", "project plan", "zzz-no-match"];

async function runSize(
  driver: AutoBenchmarkDriver,
  size: (typeof AUTO_BENCHMARK_SIZES)[number],
): Promise<PerfAutoSizeResult> {
  const { db, onProgress } = driver;
  resetPerf();

  // 1. Fixture -----------------------------------------------------------
  onProgress(`Benchmark ${size}: generating fixture…`);
  const before = driver.getNotesCount();
  const fixture = await generateFixture(db, { noteCount: size });
  pmark("auto-fixture-committed");

  // 2. List-render probe: DB commit → live query → React render → paint ----
  onProgress(`Benchmark ${size}: measuring list render…`);
  let listRender: PerfAutoSizeResult["listRender"];
  try {
    await pollFor(
      () => driver.getNotesCount() >= before + size,
      30000,
      "list to show the new fixture",
    );
    const ms = await paintProbeMs(
      "list render",
      "auto-list-painted",
      "auto-fixture-to-list-painted",
      "auto-fixture-committed",
    );
    listRender = { fixtureToListPaintedMs: ms };
  } catch (error) {
    listRender = { failed: error instanceof Error ? error.message : String(error) };
  }

  // 3. Dexie micro-benchmark ----------------------------------------------
  onProgress(`Benchmark ${size}: Dexie operations…`);
  const bench = await runDexieBench(db);
  const dexie: PerfAutoDexie = {
    count: bench.countMs,
    toArray: bench.toArrayMs,
    indexedFolderQuery: bench.indexedFolderQueryMs,
    recentSlice50: bench.recentSliceMs,
    put: bench.putMs,
    update: bench.updateMs,
    delete: bench.deleteMs,
  };

  // 4. Search computation --------------------------------------------------
  onProgress(`Benchmark ${size}: search computation…`);
  const allNotes = await db.notes.toArray();
  const folders = await db.folders.toArray();
  const tags = await db.tags.toArray();
  const search = SEARCH_QUERIES.map((query) => {
    const t0 = performance.now();
    const hits = searchNotes(
      query,
      allNotes.filter((n) => !n.deleted),
      folders,
      tags,
    ).length;
    return { query, ms: round(performance.now() - t0), hits };
  });

  // 5. Save / write timing --------------------------------------------------
  onProgress(`Benchmark ${size}: save timing…`);
  const tCreate = performance.now();
  const scratch = await createNote(db, { title: "perf bench", content: "<p>bench</p>" });
  const createMs = round(performance.now() - tCreate);
  const updateMs: number[] = [];
  for (let i = 0; i < 3; i++) {
    const tU = performance.now();
    await updateNote(
      db,
      scratch.id,
      i % 2 === 0 ? { title: `perf bench ${i}` } : { content: `<p>bench ${i}</p>` },
    );
    updateMs.push(round(performance.now() - tU));
  }
  await db.notes.delete(scratch.id);

  // 6. Editor: programmatic New Note → mount → Tiptap ready → painted -------
  onProgress(`Benchmark ${size}: editor mount…`);
  let editor: PerfAutoSizeResult["editor"];
  try {
    const t0 = perfMarkClock();
    const noteId = await driver.openNewNoteInEditor();
    await waitForMark("tiptap-ready", 30000, t0);
    const paintedMs = await paintProbeMs(
      "editor",
      "auto-editor-painted",
      "auto-new-note-to-editor-painted",
      "new-note-tap",
    );
    const lookup = measureLookup();
    const need = (name: string): number => {
      const v = lookup.get(name);
      if (v === undefined) throw new Error(`measure "${name}" missing`);
      return v;
    };
    editor = {
      tapToCreatedMs: need("new-note-tap-to-created"),
      tapToEditorMountedMs: need("new-note-tap-to-editor-mounted"),
      tapToTiptapReadyMs: need("new-note-tap-to-tiptap-ready"),
      tapToEditorPaintedMs: paintedMs,
    };
    await driver.closeEditor();
    await driver.deleteNoteById(noteId);
  } catch (error) {
    editor = { failed: error instanceof Error ? error.message : String(error) };
    try {
      await driver.closeEditor();
    } catch {
      /* best-effort cleanup */
    }
  }

  return {
    fixture: {
      generationMs: fixture.generationMs,
      notes: fixture.noteCount,
      attachments: fixture.attachmentCount,
    },
    dexie,
    dexieNoteCount: bench.noteCount,
    search,
    save: { createMs, updateMs },
    editor,
    listRender,
  };
}

/** Report stub when the benchmark cannot run (e.g. App Lock is on). */
export function blockedAutoReport(env: PerfAutoEnvironment, reason: string): PerfAutoReport {
  return {
    schema: "noma-perf-auto/1",
    generatedAt: new Date().toISOString(),
    branch: "chore/perf-baseline",
    environment: env,
    automated: { startup: {}, sizes: {} },
    deviceOnly: DEVICE_ONLY_METRICS,
    notes: [`Benchmark blocked: ${reason}`],
  };
}

/**
 * Run the full automated benchmark. Resolves with the report; also stores it
 * via setLastAutoReport() for the /perf panel to display.
 */
export async function runAutomatedBenchmark(driver: AutoBenchmarkDriver): Promise<PerfAutoReport> {
  const { env, onProgress } = driver;

  const startup: Record<string, number> = {};
  for (const m of getPerfReport().measures) {
    if (m.name.startsWith("startup-")) startup[m.name] = m.medianMs;
  }

  const sizes: Record<string, PerfAutoSizeResult> = {};
  for (const size of AUTO_BENCHMARK_SIZES) {
    // TEMP-PERF: breadcrumb for CI logcat diagnosis.
    console.log(`[autoperf] starting size ${size}`);
    sizes[String(size)] = await runSize(driver, size);
    console.log(`[autoperf] finished size ${size}`);
  }

  onProgress("Finishing…");
  const report: PerfAutoReport = {
    schema: "noma-perf-auto/1",
    generatedAt: new Date().toISOString(),
    branch: "chore/perf-baseline",
    environment: env,
    automated: { startup, sizes },
    deviceOnly: DEVICE_ONLY_METRICS,
    notes: [
      "Every 'automated' measurement above was collected without human interaction.",
      "The editor flow is driven programmatically through the same createNote + editor-mount code path as the New Note button; tap→focus→keyboard→keystroke remains device-only.",
      "Emulator measurements are preliminary smoke numbers and must never be presented as J7 Prime measurements.",
    ],
  };
  setLastAutoReport(report);
  return report;
}

/** Persist the report to app-private storage (for `adb run-as` pulls in CI). */
export async function writeAutoReportFile(report: PerfAutoReport): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await Filesystem.writeFile({
    path: "perf-report.json",
    data: JSON.stringify(report, null, 2),
    directory: Directory.Data,
  });
}

/**
 * TEMP-PERF: trigger receipt for CI. Written the moment the autoperf
 * trigger reaches JS, so CI can distinguish "deep link never arrived"
 * from "benchmark started but produced no report".
 */
export async function writeTriggerReceipt(env: PerfAutoEnvironment): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Filesystem.writeFile({
      path: "perf-trigger.json",
      data: JSON.stringify({ seenAt: new Date().toISOString(), env: env.label }),
      directory: Directory.Data,
    });
  } catch {
    /* best effort — the benchmark itself is the source of truth */
  }
}

// ---------------------------------------------------------------------------
// Trigger plumbing (module-level pending request).
// ---------------------------------------------------------------------------

let pendingAutoRequest: PerfAutoEnvironment | null = null;

/** Queue an automated benchmark run; consumed once by the workspace. */
export function requestAutoBenchmark(kind: "device" | "emulator" = "device"): void {
  pendingAutoRequest = makeAutoEnv(kind);
}

export function consumeAutoBenchmarkRequest(): PerfAutoEnvironment | null {
  const next = pendingAutoRequest;
  pendingAutoRequest = null;
  return next;
}

/** Query-param trigger: `?autoperf=1[&env=emulator]`. */
export function autoBenchmarkQueryParam(): PerfAutoEnvironment | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get("autoperf") !== "1") return null;
  const envParam = params.get("env");
  return makeAutoEnv(envParam === "emulator" ? "emulator" : envParam === "ci" ? "ci" : "device");
}
