/**
 * TEMPORARY performance baseline control panel.
 * Reachable at /perf via the temporary Settings entry. Delete this file
 * with `perf-instrumentation.ts` / `perf-fixture.ts` / `perf-automation.ts`
 * when the baseline is done.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useDatabase } from "@/lib/noma/DatabaseContext";
import {
  PERF_ENABLED,
  getLastAutoReport,
  getPerfReport,
  resetPerf,
  type PerfAutoReport,
  type PerfReport,
} from "@/lib/noma/perf-instrumentation";
import { requestAutoBenchmark } from "@/lib/noma/perf-automation";
import {
  clearFixture,
  generateFixture,
  runDexieBench,
  type DexieBenchResult,
  type FixtureResult,
} from "@/lib/noma/perf-fixture";

export const Route = createFileRoute("/perf")({
  component: PerfPanel,
});

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function AutoReportView({ report }: { report: PerfAutoReport }) {
  const copyAutoReport = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    } catch {
      /* user can select the JSON manually */
    }
  }, [report]);

  const sizeKeys = Object.keys(report.automated.sizes).sort((a, b) => Number(a) - Number(b));

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Latest automated report</h2>
        <button
          type="button"
          onClick={() => void copyAutoReport()}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
        >
          Copy report JSON
        </button>
      </div>

      <div className="space-y-1 text-sm">
        <p>
          <span className="font-medium">Environment: </span>
          {report.environment.kind === "emulator" ? (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
              EMULATOR — preliminary, NOT a J7 Prime
            </span>
          ) : (
            <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200">
              Physical device
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {report.environment.label} · {report.generatedAt}
        </p>
        {report.notes.map((note) => (
          <p key={note} className="text-xs text-muted-foreground">
            {note}
          </p>
        ))}
      </div>

      {sizeKeys.length === 0 && (
        <p className="text-sm text-muted-foreground">
          The benchmark did not complete (see notes above — e.g. App Lock was on).
        </p>
      )}

      {sizeKeys.map((size) => {
        const s = report.automated.sizes[size]!;
        const searchMedian = median(s.search.map((r) => r.ms));
        const saveMedian = median(s.save.updateMs);
        return (
          <div key={size} className="rounded-md border border-border p-3">
            <h3 className="text-sm font-medium">{size} notes</h3>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Fixture generation</dt>
              <dd className="text-right font-mono">{s.fixture.generationMs} ms</dd>
              <dt className="text-muted-foreground">Dexie count / toArray</dt>
              <dd className="text-right font-mono">
                {s.dexie.count} / {s.dexie.toArray} ms
              </dd>
              <dt className="text-muted-foreground">Dexie indexed folder query</dt>
              <dd className="text-right font-mono">{s.dexie.indexedFolderQuery} ms</dd>
              <dt className="text-muted-foreground">Dexie recent-50 slice</dt>
              <dd className="text-right font-mono">{s.dexie.recentSlice50} ms</dd>
              <dt className="text-muted-foreground">Search compute (median of 5)</dt>
              <dd className="text-right font-mono">{searchMedian} ms</dd>
              <dt className="text-muted-foreground">Save: create / update median</dt>
              <dd className="text-right font-mono">
                {s.save.createMs} / {saveMedian} ms
              </dd>
              <dt className="text-muted-foreground">Editor: tap → painted</dt>
              <dd className="text-right font-mono">
                {"failed" in s.editor
                  ? `failed: ${s.editor.failed}`
                  : `${s.editor.tapToEditorPaintedMs} ms`}
              </dd>
              <dt className="text-muted-foreground">List: fixture → painted</dt>
              <dd className="text-right font-mono">
                {"failed" in s.listRender
                  ? `failed: ${s.listRender.failed}`
                  : `${s.listRender.fixtureToListPaintedMs} ms`}
              </dd>
            </dl>
          </div>
        );
      })}

      {Object.keys(report.automated.startup).length > 0 && (
        <div>
          <h3 className="text-sm font-medium">Warm start (this session, JS only)</h3>
          <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {Object.entries(report.automated.startup).map(([name, ms]) => (
              <div key={name} className="contents">
                <dt className="text-muted-foreground">{name}</dt>
                <dd className="text-right font-mono">{ms} ms</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div>
        <h3 className="text-sm font-medium">
          Device-only{" "}
          <span className="font-normal text-muted-foreground">
            (optional validation — not automated)
          </span>
        </h3>
        <ul className="mt-1 space-y-2 text-xs text-muted-foreground">
          {report.deviceOnly.map((d) => (
            <li key={d.metric}>
              <span className="font-medium text-foreground">{d.metric}</span>
              <br />
              {d.howTo}
            </li>
          ))}
        </ul>
      </div>

      <details>
        <summary className="cursor-pointer text-xs text-muted-foreground underline">
          Full JSON
        </summary>
        <pre className="mt-2 max-h-96 overflow-auto rounded-md border border-border bg-background p-3 text-xs">
          {JSON.stringify(report, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function PerfPanel() {
  const { db } = useDatabase();
  const navigate = useNavigate();
  const [report, setReport] = useState<PerfReport | null>(null);
  const [autoReport, setAutoReport] = useState<PerfAutoReport | null>(null);
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    setReport(getPerfReport());
    setAutoReport(getLastAutoReport());
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 2000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function run<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
    if (!db) {
      setStatus("Database not ready yet.");
      return null;
    }
    setBusy(true);
    setStatus(`${label}…`);
    try {
      const result = await fn();
      setStatus(`${label}: done.`);
      return result;
    } catch (error) {
      setStatus(`${label}: failed — ${error instanceof Error ? error.message : String(error)}`);
      return null;
    } finally {
      setBusy(false);
      refresh();
    }
  }

  const copyReport = useCallback(async () => {
    const json = JSON.stringify(getPerfReport(), null, 2);
    try {
      await navigator.clipboard.writeText(json);
      setStatus("Report copied to clipboard.");
    } catch {
      setStatus("Clipboard unavailable — select the JSON below manually.");
    }
  }, []);

  if (!PERF_ENABLED) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <p>Performance instrumentation is disabled.</p>
        <Link to="/" className="underline">
          Back
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="font-serif text-2xl font-medium">Performance baseline (temporary)</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One tap runs the whole automated baseline. Human/device-only metrics are listed as
          optional validation — nothing is required from you beyond this button. This panel and its
          route are temporary.
        </p>
        <Link to="/" className="text-sm underline">
          Back to Noma
        </Link>
      </div>

      <section className="space-y-2 rounded-lg border border-primary/30 bg-card p-4">
        <h2 className="text-sm font-medium">Automated benchmark</h2>
        <p className="text-xs text-muted-foreground">
          Generates the 100 / 500 / 2,000-note fixtures and measures Dexie operations, search
          computation, save timing, editor mount, and list render — fully automatically. Takes a few
          minutes; keep the app open and make sure App Lock is off. Produces one copyable JSON
          report.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            requestAutoBenchmark("device");
            void navigate({ to: "/" });
          }}
          className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
        >
          Run Performance Benchmark
        </button>
      </section>

      {autoReport && <AutoReportView report={autoReport} />}

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Manual tools (ad-hoc checks)</h2>
        <div className="flex flex-wrap gap-2">
          {[100, 500, 2000].map((n) => (
            <button
              key={n}
              type="button"
              disabled={busy}
              onClick={() =>
                void run(`Generate ${n} notes`, async () => {
                  const r: FixtureResult = await generateFixture(db!, {
                    noteCount: n as 100 | 500 | 2000,
                  });
                  setStatus(
                    `Fixture: ${r.noteCount} notes, ${r.attachmentCount} attachments in ${r.generationMs} ms.`,
                  );
                })
              }
              className="rounded-md border border-border px-3 py-2 text-sm"
            >
              Generate {n} notes
            </button>
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run("Clear fixture", async () => {
                const r = await clearFixture(db!);
                setStatus(`Fixture cleared (${r.deletedNotes} notes removed).`);
              })
            }
            className="rounded-md border border-border px-3 py-2 text-sm"
          >
            Clear fixture
          </button>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Dexie micro-benchmark</h2>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run("Dexie bench", async () => {
              const r: DexieBenchResult = await runDexieBench(db!);
              setStatus(`Dexie bench: toArray ${r.toArrayMs} ms over ${r.noteCount} notes.`);
            })
          }
          className="rounded-md border border-border px-3 py-2 text-sm"
        >
          Run Dexie bench
        </button>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Live marks report</h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={refresh}
            className="rounded-md border border-border px-3 py-2 text-sm"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => {
              resetPerf();
              refresh();
              setStatus("Marks cleared.");
            }}
            className="rounded-md border border-border px-3 py-2 text-sm"
          >
            Reset marks
          </button>
          <button
            type="button"
            onClick={() => void copyReport()}
            className="rounded-md border border-border px-3 py-2 text-sm"
          >
            Copy report JSON
          </button>
        </div>
        {status && <p className="text-sm text-muted-foreground">{status}</p>}
        <pre className="max-h-96 overflow-auto rounded-md border border-border bg-card p-3 text-xs">
          {report ? JSON.stringify(report, null, 2) : "…"}
        </pre>
      </section>
    </main>
  );
}
