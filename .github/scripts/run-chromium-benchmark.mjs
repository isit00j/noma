#!/usr/bin/env node
/**
 * TEMPORARY: drives the automated perf benchmark in headless Chromium.
 *
 * Serves the production web build, navigates to ?autoperf=1&env=ci, waits
 * for window.__nomaPerfReport, saves perf-report.ci.json and prints a
 * summary. Numbers are preliminary smoke numbers from a CI Linux runner —
 * never J7 Prime measurements.
 *
 * Delete with .github/workflows/perf-baseline.yml when the baseline is done.
 */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const PORT = 4173;
const URL = `http://127.0.0.1:${PORT}/?autoperf=1&env=ci`;
const OUT = "perf-report.ci.json";

function waitForPort() {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 60_000;
    const tick = () => {
      import("node:net")
        .then(({ connect }) => {
          const socket = connect(PORT, "127.0.0.1");
          socket.on("connect", () => {
            socket.end();
            resolve();
          });
          socket.on("error", () => {
            socket.destroy();
            if (Date.now() > deadline) reject(new Error("preview server never came up"));
            else setTimeout(tick, 500);
          });
        })
        .catch(reject);
    };
    tick();
  });
}

const preview = spawn(
  // Local vite binary directly: deterministic, no npx resolution involved.
  process.cwd() + "/node_modules/.bin/vite",
  ["preview", "--port", String(PORT), "--strictPort"],
  { stdio: ["ignore", "pipe", "pipe"] },
);
let previewFailed = false;
let previewStderr = "";
preview.stderr.on("data", (d) => {
  previewStderr += d.toString();
});
preview.on("exit", (code) => {
  previewFailed = true;
  console.error(`preview server exited with code ${code}\n${previewStderr.slice(-2000)}`);
});

try {
  await waitForPort();
  if (previewFailed) throw new Error("preview server died before the benchmark ran");

  const browser = await chromium.launch({
    // Local testing: PLAYWRIGHT_CHROMIUM_PATH=/opt/meta-chromium/chrome
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    // The sandbox's Chromium build enforces Local Network Access checks that
    // block navigation to the local preview server, and proxy env vars get
    // in the way; CI's bundled Chromium does not need either workaround.
    args: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? ["--disable-features=LocalNetworkAccessChecks", "--no-proxy-server"]
      : [],
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    // TEMP-PERF: stream diagnostics in real time so a timeout still leaves
    // breadcrumbs about how far the benchmark got.
    page.on("pageerror", (err) => {
      const s = String(err);
      errors.push(s);
      console.log("[pageerror]", s.slice(0, 300));
    });
    page.on("console", (msg) => {
      const text = msg.text();
      if (text.includes("[autoperf]") || msg.type() === "error" || msg.type() === "warning") {
        console.log(`[console.${msg.type()}]`, text.slice(0, 300));
      }
    });
    await page.goto(URL, { waitUntil: "domcontentloaded" });
    console.log("Page loaded, waiting for the benchmark report (up to ~12 min)…");
    // NOTE: page.waitForFunction's signature is (pageFunction, arg, options) —
    // the options object must be the THIRD argument. Passing it second made
    // Playwright treat it as `arg` and silently fall back to the 30s default
    // timeout, which killed CI runs even when the benchmark was healthy.
    try {
      await page.waitForFunction(() => window.__nomaPerfReport != null, undefined, {
        timeout: 12 * 60 * 1000,
        polling: 2000,
      });
    } catch (e) {
      console.log("Timed out waiting for the report. Page debug state:");
      try {
        const dbg = await page.evaluate(() => ({
          title: document.title,
          rootChildren: document.getElementById("root")?.childElementCount ?? -1,
          bodyTextStart: document.body?.innerText?.slice(0, 200) ?? "",
          report: typeof window.__nomaPerfReport,
          href: location.href,
        }));
        console.log(JSON.stringify(dbg, null, 1).slice(0, 1000));
      } catch (evalErr) {
        console.log("debug evaluate failed:", String(evalErr).slice(0, 200));
      }
      throw e;
    }
    const report = await page.evaluate(() => window.__nomaPerfReport);
    if (errors.length > 0) {
      console.log("page errors seen during run:");
      for (const e of errors.slice(0, 5)) console.log("  " + e.slice(0, 200));
    }
    writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(`Report saved to ${OUT}`);
    console.log("environment:", report.environment.label);
    console.log("WARNING:", report.environment.warning);
    for (const note of report.notes ?? []) console.log("note:", note);
    for (const size of Object.keys(report.automated.sizes).sort((a, b) => Number(a) - Number(b))) {
      const s = report.automated.sizes[size];
      console.log(`--- ${size} notes ---`);
      console.log("  fixture gen:", s.fixture.generationMs, "ms");
      console.log("  dexie toArray:", s.dexie.toArray, "ms");
      console.log(
        "  editor:",
        "failed" in s.editor ? s.editor : `tap->painted ${s.editor.tapToEditorPaintedMs} ms`,
      );
      console.log(
        "  list:",
        "failed" in s.listRender ? s.listRender : `fixture->painted ${s.listRender.fixtureToListPaintedMs} ms`,
      );
    }
  } finally {
    await browser.close();
  }
} finally {
  preview.kill("SIGKILL");
}
