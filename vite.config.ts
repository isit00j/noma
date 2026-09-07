import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
    prerender: {
      routes: [], // Disabled prerender config so the Lovable wrapper doesn't corrupt .vercel/output
      crawlLinks: false,
    },
  },
  vite: {
    plugins: [],
  },
});
