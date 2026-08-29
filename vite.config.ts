import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
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
        // We set navigateFallback to false because we haven't generated index.html yet.
        // Wait, navigateFallback doesn't accept false. We can use navigateFallback: undefined.
        // Wait, if we use navigateFallback: null, it skips it.
        // Actually, workbox-cli overrides sw.js so it doesn't matter what generatesSW does, as long as it doesn't fail!
        // It failed previously because navigateFallback was '/index.html' which didn't exist.
        // So we can just omit navigateFallback entirely here!
        workbox: {
          globDirectory: ".output/public",
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,woff,json,webmanifest}"],
          globIgnores: ["**/node_modules/**/*", "sw.js", "workbox-*.js"],
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
