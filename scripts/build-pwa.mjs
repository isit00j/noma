import { spawn } from "child_process";
import fs from "fs";
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

async function fetchWithRetry(url, maxRetries = 20, delayMs = 500) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: "text/html",
          "X-TSS_SHELL": "true",
        },
      });
      if (response.ok) return response;
    } catch (e) {
      // ignore connection refused
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error("Server did not become ready in time");
}

async function main() {
  const isVercel = process.env.VERCEL === "1";
  const outputPublicDir = path.resolve(rootDir, ".output/public");
  const vercelStaticDir = path.resolve(rootDir, ".vercel/output/static");
  const publicDir = path.resolve(rootDir, "public");

  console.log("=== Stage 1: Building TanStack Start Application ===");
  execSync("npm run build:vite", { stdio: "inherit" });

  // Make absolutely sure manifest.json gets put into .output/public and .vercel/output/static
  if (fs.existsSync(path.join(publicDir, "manifest.json"))) {
      if (!fs.existsSync(outputPublicDir)) fs.mkdirSync(outputPublicDir, { recursive: true });
      fs.copyFileSync(path.join(publicDir, "manifest.json"), path.join(outputPublicDir, "manifest.json"));
      if (isVercel) {
          if (!fs.existsSync(vercelStaticDir)) fs.mkdirSync(vercelStaticDir, { recursive: true });
          fs.copyFileSync(path.join(publicDir, "manifest.json"), path.join(vercelStaticDir, "manifest.json"));
      }
  }

  console.log("\n=== Stage 2: Generating Application Shell ===");

  console.log("Starting temporary preview server...");
  const serverProcess = spawn("npx", ["nitro", "preview"], {
    stdio: "pipe",
  });

  let port = 3000;
  let serverReady = false;

  serverProcess.stdout.on("data", (data) => {
    const output = data.toString();
    const match = output.match(/Listening on http:\/\/[^:]+:(\d+)/);
    if (match || output.includes("Listening on")) {
      if (match) port = parseInt(match[1], 10);
      serverReady = true;
    }
  });

  serverProcess.stderr.on("data", (data) => {
    const output = data.toString();
    const match = output.match(/Listening on http:\/\/[^:]+:(\d+)/);
    if (match || output.includes("Listening on")) {
      if (match) port = parseInt(match[1], 10);
      serverReady = true;
    }
  });

  try {
    for (let i = 0; i < 30; i++) {
      if (serverReady) break;
      await new Promise((r) => setTimeout(r, 200));
    }

    if (!serverReady) {
      console.log("Server didn't log ready string, attempting to fetch anyway...");
    }

    const url = `http://localhost:${port}/`;
    console.log(`Waiting for server to become ready at ${url}...`);

    const res = await fetchWithRetry(url, 20, 500);
    const html = await res.text();

    if (!html.includes("<html") || !html.includes("assets/")) {
      throw new Error(
        `Failed to generate a valid HTML shell. Output: ${html.substring(0, 100)}...`,
      );
    }

    if (fs.existsSync(outputPublicDir)) {
      fs.writeFileSync(path.join(outputPublicDir, "index.html"), html);
    }

    if (isVercel && fs.existsSync(vercelStaticDir)) {
      fs.writeFileSync(path.join(vercelStaticDir, "index.html"), html);
    }

    console.log(`Successfully wrote index.html (${html.length} bytes)`);

  } finally {
    console.log("Shutting down temporary preview server...");
    serverProcess.kill("SIGTERM");
  }

  console.log("\n=== Stage 3: Bundling and Injecting Service Worker ===");
  execSync("node scripts/build-sw.mjs", { stdio: "inherit" });

  if (isVercel && fs.existsSync(vercelStaticDir)) {
      console.log("Vercel mode: Copying service worker and manifest to vercel static dir to ensure availability.");
      fs.copyFileSync(path.join(outputPublicDir, "sw.js"), path.join(vercelStaticDir, "sw.js"));

      // Explicitly copy public/ files correctly
      const publicFiles = fs.readdirSync(publicDir);
      for (const file of publicFiles) {
          const srcPath = path.join(publicDir, file);
          const destPath = path.join(vercelStaticDir, file);
          if (fs.statSync(srcPath).isFile() && !fs.existsSync(destPath)) {
              fs.copyFileSync(srcPath, destPath);
          }
      }

      // Enforce manifest.json copy
      if (fs.existsSync(path.join(publicDir, "manifest.json"))) {
          fs.copyFileSync(path.join(publicDir, "manifest.json"), path.join(vercelStaticDir, "manifest.json"));
      }
  }

  console.log("\n=== Stage 4: Verifying Workbox Service Worker ===");
  const swDest = outputPublicDir;
  if (!fs.existsSync(path.join(swDest, "sw.js"))) {
     console.error(`Error: sw.js was not generated at ${swDest}.`);
     process.exit(1);
  }
  const swContent = fs.readFileSync(path.join(swDest, "sw.js"), "utf8");
  if (!swContent.includes("index.html")) {
    console.error("Error: sw.js does not contain index.html in precache or fallback.");
    process.exit(1);
  }

  console.log("Validation passed! PWA build complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Build failed:", err);
  if (err.output) {
    console.error(err.output.toString());
  }
  process.exit(1);
});
