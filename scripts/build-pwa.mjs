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

    const swSourceCandidates = [vercelStaticDir, ".output/public"];
    const swSourceDir = swSourceCandidates.find((dir) => fs.existsSync(`${dir}/sw.js`));

    if (!swSourceDir) {
      throw new Error(`sw.js was not generated in any expected directory: ${swSourceCandidates.join(", ")}`);
    }

    if (!fs.existsSync(vercelStaticDir)) {
      throw new Error(`Expected Vercel static dir not found: ${vercelStaticDir}`);
    }

    if (swSourceDir !== vercelStaticDir) {
      fs.copyFileSync(`${swSourceDir}/sw.js`, `${vercelStaticDir}/sw.js`);
    }

    const files = fs.readdirSync(swSourceDir);
    for (const file of files) {
      if (file.startsWith("workbox-") && file.endsWith(".js") && swSourceDir !== vercelStaticDir) {
        fs.copyFileSync(`${swSourceDir}/${file}`, `${vercelStaticDir}/${file}`);
      }
    }

    const finalWorkboxFiles = fs
      .readdirSync(vercelStaticDir)
      .filter((file) => file.startsWith("workbox-") && file.endsWith(".js"));

    if (!fs.existsSync(`${vercelStaticDir}/sw.js`) || finalWorkboxFiles.length === 0) {
      throw new Error(`Post-build static output is missing PWA files in ${vercelStaticDir}`);
    }

    console.log(`SW source directory: ${swSourceDir}`);
    console.log(`Final workbox files in ${vercelStaticDir}: ${finalWorkboxFiles.join(", ")}`);
    console.log(`Successfully wrote index.html (${html.length} bytes)`);

  } finally {
    console.log("Shutting down temporary preview server...");
    serverProcess.kill("SIGTERM");
  }

  console.log("\n=== Stage 3: Verifying Workbox Service Worker ===");
  const swContent = fs.readFileSync(`${vercelStaticDir}/sw.js`, "utf8");
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
