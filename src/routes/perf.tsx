/**
 * TEMPORARY performance baseline control panel (J7 Prime).
 * Reachable at /perf via the temporary Settings entry. Delete this file
 * with `perf-instrumentation.ts` / `perf-fixture.ts` when the baseline is done.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useDatabase } from "@/lib/noma/DatabaseContext";
import {
  PERF_ENABLED,
  getPerfReport,
  resetPerf,
  type PerfReport,
} from "@/lib/noma/perf-instrumentation";
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

function PerfPanel() {
  const { db } = useDatabase();
  const [report, setReport] = useState<PerfReport | null>(null);
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => setReport(getPerfReport()), []);

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
          J7 Prime protocol: reboot, battery &gt; 50%, airplane mode on. Generate a fixture, run
          each metric 5×, report medians. This panel and its route are temporary.
        </p>
        <Link to="/" className="text-sm underline">
          Back to Noma
        </Link>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">1. Fixture data (deterministic, idempotent)</h2>
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
        <h2 className="text-sm font-medium">2. Dexie micro-benchmark</h2>
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
        <h2 className="text-sm font-medium">3. Report</h2>
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
