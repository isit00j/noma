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
    fs.copyFileSync(
      path.join(publicDir, "manifest.json"),
      path.join(outputPublicDir, "manifest.json"),
    );
    if (isVercel) {
      if (!fs.existsSync(vercelStaticDir)) fs.mkdirSync(vercelStaticDir, { recursive: true });
      fs.copyFileSync(
        path.join(publicDir, "manifest.json"),
        path.join(vercelStaticDir, "manifest.json"),
      );
    }
  }

  console.log("\n=== Stage 2: Generating Application Shell & Web Homepage ===");
  try {
    const serverPath = isVercel
      ? path.resolve(rootDir, ".vercel/output/functions/__server.func/index.mjs")
      : path.resolve(rootDir, ".output/server/index.mjs");

    console.log("Loading server handler from", serverPath);

    // Import the compiled Nitro server handler directly
    const app = await import(pathToFileURL(serverPath).href);

    const renderRoute = async (urlPath) => {
      const reqUrl = `http://localhost${urlPath}`;
      if (app.default && app.default.fetch) {
        const req = new Request(reqUrl, {
          headers: {
            accept: "text/html",
            "X-TSS_SHELL": "true",
          },
        });
        const env = {};
        const ctx = {
          waitUntil: () => {},
          passThroughOnException: () => {},
        };
        const res = await app.default.fetch(req, env, ctx);
        if (!res.ok) throw new Error(`Failed to fetch ${urlPath}, status: ${res.status}`);
        return await res.text();
      } else if (typeof app.default === "function") {
        const mockReq = {
          url: urlPath,
          method: "GET",
          headers: {
            accept: "text/html",
            "x-tss_shell": "true",
          },
        };

        let responseBody = "";
        const mockRes = {
          statusCode: 200,
          setHeader: () => {},
          end: (chunk) => {
            if (chunk) responseBody += chunk;
          },
          write: (chunk) => {
            if (chunk) responseBody += chunk;
          },
        };

        await app.default(mockReq, mockRes);
        return responseBody;
      } else {
        throw new Error("Unable to determine how to execute the server handler.");
      }
    };

    // Render clean application shell from /app for Capacitor/Android
    console.log("Executing server handler to fetch clean app shell (/app)...");
    const appShellHtml = await renderRoute("/app");
    if (!appShellHtml.includes("<html") || !appShellHtml.includes("assets/")) {
      throw new Error(`Invalid HTML app shell output: ${appShellHtml.substring(0, 100)}...`);
    }

    if (fs.existsSync(outputPublicDir)) {
      fs.writeFileSync(path.join(outputPublicDir, "index.html"), appShellHtml);
      console.log(
        `Successfully wrote native app shell to .output/public/index.html (${appShellHtml.length} bytes)`,
      );
    }

    // Render full SSR marketing/SEO homepage from / for Vercel static homepage
    if (isVercel && fs.existsSync(vercelStaticDir)) {
      console.log("Executing server handler to fetch SSR marketing/SEO homepage (/)...");
      const homepageHtml = await renderRoute("/");
      if (!homepageHtml.includes("<html") || !homepageHtml.includes("assets/")) {
        throw new Error(`Invalid HTML homepage output: ${homepageHtml.substring(0, 100)}...`);
      }
      fs.writeFileSync(path.join(vercelStaticDir, "index.html"), homepageHtml);
      console.log(
        `Successfully wrote SSR marketing homepage to .vercel/output/static/index.html (${homepageHtml.length} bytes)`,
      );
    }
  } catch (e) {
    console.error("Failed to generate application shell using direct handler invocation:");
    console.error(e);
    process.exit(1);
  }

  console.log("\n=== Stage 3: Bundling and Injecting Service Worker ===");
  execSync("node scripts/build-sw.mjs", { stdio: "inherit" });

  if (isVercel && fs.existsSync(vercelStaticDir)) {
    console.log(
      "Vercel mode: Copying service worker and manifest to vercel static dir to ensure availability.",
    );
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
      fs.copyFileSync(
        path.join(publicDir, "manifest.json"),
        path.join(vercelStaticDir, "manifest.json"),
      );
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
