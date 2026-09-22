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
import { writeFileSync, readFileSync, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const PORT = 4173;
const URL = `http://127.0.0.1:${PORT}/?autoperf=1&env=ci`;
const OUT = "perf-report.ci.json";
// The production build is a static SPA in .output/public. NOTE: `vite
// preview` does NOT work here — it tries to boot an SSR server from
// dist/server/server.js (which this build never emits) and answers every
// page request with HTTP 500, so the app never runs. Serve the static
// output directly instead.
const STATIC_ROOT = process.cwd() + "/.output/public";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

function startStaticServer() {
  return new Promise((resolve, reject) => {
    // TEMP-PERF: startup sanity — CI once 404'd the document even though the
    // build had just written it, so log what we can actually see.
    console.log(
      `static root check: index.html ${existsSync(join(STATIC_ROOT, "index.html")) ? "present" : "MISSING"}`,
    );
    const server = createServer((req, res) => {
      try {
        const urlPath = decodeURIComponent(new URL(req.url, `http://127.0.0.1:${PORT}`).pathname);
        let filePath = normalize(join(STATIC_ROOT, urlPath));
        // Never escape the static root.
        if (!filePath.startsWith(STATIC_ROOT)) {
          res.writeHead(403);
          res.end("forbidden");
          return;
        }
        // SPA fallback: directories and unknown paths serve index.html.
        if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
          filePath = join(STATIC_ROOT, "index.html");
        }
        const body = readFileSync(filePath);
        res.writeHead(200, {
          "content-type": MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream",
          "content-length": body.length,
        });
        res.end(body);
      } catch (e) {
        console.log(`static 404: ${req.url} -> ${e.message}`);
        res.writeHead(404);
        res.end("not found");
      }
    });
    server.on("error", reject);
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

const server = await startStaticServer();
console.log(`Static server serving ${STATIC_ROOT} on port ${PORT}`);

try {
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
  server.close();
}
