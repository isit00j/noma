import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

// Bypass Lovable sandbox lockdown so the build statically generates the application shell
process.env["LOVABLE_SANDBOX"] = "0";
delete process.env["DEV_SERVER__PROJECT_PATH"];

// In order to provide a content-based revision for index.html when injecting it manually
// into Workbox (because VitePWA runs before Nitro generates index.html), we extract a
// unique build identifier.
const buildRevision = process.env["VERCEL_GIT_COMMIT_SHA"] || Date.now().toString();

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
    prerender: {
      routes: ["/"],
      crawlLinks: false, // strictly only prerender the root shell
    },
    // We must explicitly list the page and enable prerender because `crawlLinks: false`
    // would otherwise disable the prerender logic completely.
    pages: [{ path: "/", prerender: { enabled: true } }],
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
        outDir: ".output/public",
        workbox: {
          globDirectory: ".output/public",
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,woff,json,webmanifest}"],
          globIgnores: ["**/node_modules/**/*", "sw.js", "workbox-*.js"],
          navigateFallback: "/index.html",
          manifestTransforms: [
            async (manifestEntries, compilation) => {
              // We filter out manifest.webmanifest here to prevent duplicates
              const filteredEntries = manifestEntries.filter(
                (e) => !e.url.includes("manifest.webmanifest") && !e.url.includes("index.html"),
              );

              // Manually inject the root index.html. Because Workbox runs before
              // Nitro emits the prerendered HTML, it misses the file during glob scan.
              filteredEntries.push({
                url: "index.html", // URL must be relative to globDirectory in manifest
                revision: buildRevision,
                size: 0,
              });

              return { manifest: filteredEntries, warnings: [] };
            },
          ],
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
