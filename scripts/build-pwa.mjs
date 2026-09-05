import { spawn } from "child_process";
import fs from "fs";
import { execSync } from "child_process";

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
  const vercelStaticDir = ".vercel/output/static";

  console.log("=== Stage 1: Building TanStack Start Application ===");
  execSync("npm run build:vite", { stdio: "inherit" });

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

    if (fs.existsSync(".output/public")) {
      fs.writeFileSync(".output/public/index.html", html);
    }

    if (fs.existsSync(vercelStaticDir)) {
      fs.writeFileSync(`${vercelStaticDir}/index.html`, html);
    }
  } finally {
    console.log("Shutting down temporary preview server...");
    serverProcess.kill("SIGTERM");
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
