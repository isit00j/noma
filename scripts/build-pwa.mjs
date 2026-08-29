import { execSync } from "child_process";
import fs from "fs";
import path from "path";

async function main() {
  console.log("=== Stage 1: Building TanStack Start Application ===");
  execSync("npm run build:vite", { stdio: "inherit" });

  console.log("\n=== Stage 2: Generating Application Shell ===");
  const serverModule = await import("../.output/server/index.mjs");
  const fetchFn = serverModule.default?.fetch || serverModule.fetch;

  if (!fetchFn) {
    console.error("Error: Could not find fetch handler in built server module.");
    process.exit(1);
  }

  // Use the undocumented TSS_SHELL header which TanStack Start uses internally for SPA fallback generation
  const req = new Request("http://localhost/", {
    headers: {
      accept: "text/html",
      "X-TSS_SHELL": "true",
    },
  });

  const res = await fetchFn(req, process.env, { waitUntil: () => {} });
  const html = await res.text();

  if (res.status !== 200 || !html.includes("<html")) {
    console.error(`Error: Failed to generate HTML shell. Status: ${res.status}`);
    console.error(html);
    process.exit(1);
  }

  // Validate the generated HTML visually via assertions
  if (!html.includes('id="$tsr-stream-barrier"')) {
    console.error("Error: Generated HTML does not contain TanStack Router bootstrap script.");
    process.exit(1);
  }

  if (!html.includes("assets/")) {
    console.error("Error: Generated HTML does not contain asset references.");
    process.exit(1);
  }

  fs.writeFileSync(".output/public/index.html", html);
  console.log(`Successfully wrote .output/public/index.html (${html.length} bytes)`);

  console.log("\n=== Stage 3: Generating Workbox Service Worker ===");
  execSync("npx workbox-cli generateSW workbox-config.cjs", { stdio: "inherit" });

  console.log("\n=== Stage 4: Validating Output ===");
  const swContent = fs.readFileSync(".output/public/sw.js", "utf8");
  if (!swContent.includes("index.html")) {
    console.error("Error: sw.js does not contain index.html in precache or fallback.");
    process.exit(1);
  }

  console.log("Validation passed! PWA build complete.");
}

main().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
