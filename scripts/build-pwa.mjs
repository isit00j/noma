import fs from "fs";
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

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
  try {
    const serverPath = isVercel
        ? path.resolve(rootDir, ".vercel/output/functions/__server.func/index.mjs")
        : path.resolve(rootDir, ".output/server/index.mjs");

    console.log("Loading server handler from", serverPath);

    // Import the compiled Nitro server handler directly
    const app = await import(pathToFileURL(serverPath).href);

    // Simulate a request to get the shell
    const req = new Request('http://localhost/', {
      headers: {
        accept: 'text/html',
        'X-TSS_SHELL': 'true'
      }
    });

    console.log("Executing server handler to fetch shell...");

    let html;

    // Vercel edge/serverless handler vs Cloudflare worker handler
    if (app.default && app.default.fetch) {
        const env = {};
        const ctx = {
          waitUntil: () => {},
          passThroughOnException: () => {}
        };
        const res = await app.default.fetch(req, env, ctx);
        if (!res.ok) throw new Error(`Failed to fetch shell, status: ${res.status}`);
        html = await res.text();
    } else if (typeof app.default === 'function') {
        // Fallback if it exports a standard request handler
        const { Readable } = await import('stream');

        const mockReq = {
            url: '/',
            method: 'GET',
            headers: {
                accept: 'text/html',
                'x-tss_shell': 'true'
            }
        };

        let responseBody = '';
        const mockRes = {
            statusCode: 200,
            setHeader: () => {},
            end: (chunk) => { if(chunk) responseBody += chunk; },
            write: (chunk) => { if(chunk) responseBody += chunk; }
        };

        await app.default(mockReq, mockRes);
        html = responseBody;
    } else {
        throw new Error("Unable to determine how to execute the server handler.");
    }

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
  } catch (e) {
    console.error("Failed to generate application shell using direct handler invocation:");
    console.error(e);
    process.exit(1);
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
