import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

// Override environment variables to convince @lovable.dev/vite-tanstack-config
// that we are NOT in the sandbox. This allows TanStack Start's Nitro build
// to natively generate the necessary index.html file for offline PWA functionality
// instead of forcing it to skip rendering the shell and falling back to SSR.
process.env["LOVABLE_SANDBOX"] = "0";
delete process.env["DEV_SERVER__PROJECT_PATH"];

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
    prerender: {
      routes: ["/"],
      crawlLinks: true,
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
        outDir: ".output/public",
        workbox: {
          globDirectory: ".output/public",
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,woff,json,webmanifest}"],
          globIgnores: ["**/node_modules/**/*", "sw.js", "workbox-*.js"],
          navigateFallback: "/index.html",
          // Explicity precache the prerendered HTML shell
          additionalManifestEntries: [{ url: "/index.html", revision: null }],
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
