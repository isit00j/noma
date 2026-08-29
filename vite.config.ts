import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";
import * as fs from "fs";
import * as path from "path";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      {
        name: "generate-fallback-html",
        closeBundle() {
          const outputDir = path.resolve(".output/public");

          if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
          }

          let clientJsFile = "";
          let clientCssFile = "";
          const assetsDir = path.join(outputDir, "assets");
          if (fs.existsSync(assetsDir)) {
            const files = fs.readdirSync(assetsDir);
            const indexFile = files.find(
              (f: string) => f.startsWith("index-") && f.endsWith(".js"),
            );
            if (indexFile) {
              clientJsFile = "/assets/" + indexFile;
            }
            const cssFile = files.find(
              (f: string) => f.startsWith("styles-") && f.endsWith(".css"),
            );
            if (cssFile) {
              clientCssFile = "/assets/" + cssFile;
            }
          }

          const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Noma — Calm, offline-first notes</title>
  <meta name="description" content="A minimalist note-taking app that works offline and keeps your notes on your device." />
  <meta name="theme-color" content="#0B0F1A" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <link rel="icon" href="/favicon.ico" type="image/x-icon" />
  <link rel="icon" href="/noma-icon-32.png" type="image/png" sizes="32x32" />
  <link rel="icon" href="/noma-icon-192.png" type="image/png" sizes="192x192" />
  <link rel="icon" href="/noma-icon-512.png" type="image/png" sizes="512x512" />
  <link rel="apple-touch-icon" href="/noma-icon-180.png" sizes="180x180" />
  ${clientCssFile ? `<link rel="stylesheet" href="${clientCssFile}">` : ""}
  ${clientJsFile ? `<script type="module" src="${clientJsFile}"></script>` : ""}
</head>
<body>
  <div id="root"></div>
</body>
</html>`;
          fs.writeFileSync(path.join(outputDir, "index.html"), html);
        },
      },
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
          // Don't manually add it to additionalManifestEntries, letting globPatterns pick it up ensures no duplicates.
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
