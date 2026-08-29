import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

async function precachePrerenderedShell() {
  const publicDir = join(process.cwd(), ".output", "public");
  const [shellHtml, serviceWorker] = await Promise.all([
    readFile(join(publicDir, "index.html"), "utf8"),
    readFile(join(publicDir, "sw.js"), "utf8"),
  ]);

  if (serviceWorker.includes('url:"index.html"') || serviceWorker.includes("url:'index.html'")) {
    return;
  }

  const shellEntry = `{url:"index.html",revision:"${createHash("md5").update(shellHtml).digest("hex")}"}`;
  const updatedServiceWorker = serviceWorker.replace(
    "precacheAndRoute([",
    `precacheAndRoute([${shellEntry},`,
  );

  if (updatedServiceWorker === serviceWorker) {
    throw new Error("Could not add the prerendered TanStack Start shell to Workbox precache.");
  }

  await writeFile(join(publicDir, "sw.js"), updatedServiceWorker);
}

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
    prerender: {
      enabled: true,
      filter: (page: { path: string }) => page.path === "/",
      onSuccess: () => precachePrerenderedShell(),
    },
  },
  vite: {
    plugins: [
      VitePWA({
        strategies: "generateSW",
        registerType: "prompt",
        devOptions: {
          enabled: false,
        },
        injectRegister: false,
        includeManifestIcons: false,
        // Make sure it runs properly for the Tanstack build directory structure
        outDir: ".output/public",
        workbox: {
          globDirectory: ".output/public",
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,woff,json}"],
          globIgnores: ["**/node_modules/**/*", "sw.js", "workbox-*.js"],
          navigateFallback: "/index.html",
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "google-fonts-cache",
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "gstatic-fonts-cache",
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        manifest: {
          name: "Noma",
          short_name: "Noma",
          description: "A quiet place for your thoughts.",
          theme_color: "#0B0F1A",
          background_color: "#0B0F1A",
          display: "standalone",
          start_url: "/",
          scope: "/",
          icons: [
            {
              src: "/noma-icon-192.png",
              sizes: "192x192",
              type: "image/png",
            },
            {
              src: "/noma-icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any maskable",
            },
          ],
        },
      }),
    ],
  },
});
