import { precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { PrecacheFallbackPlugin } from "workbox-precaching";
import type { WorkboxPlugin } from "workbox-core";

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: any;
};

// Precache the assets injected by VitePWA
precacheAndRoute(self.__WB_MANIFEST || []);

// Cache Google Fonts stylesheets
registerRoute(
  /^https:\/\/fonts\.googleapis\.com\/.*/i,
  new CacheFirst({
    cacheName: "google-fonts-cache",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 60 * 60 * 24 * 365,
      }) as unknown as WorkboxPlugin,
    ],
  }),
);

// Cache Google Fonts webfonts
registerRoute(
  /^https:\/\/fonts\.gstatic\.com\/.*/i,
  new CacheFirst({
    cacheName: "gstatic-fonts-cache",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 60 * 60 * 24 * 365,
      }) as unknown as WorkboxPlugin,
    ],
  }),
);

// SPA navigation fallback to index.html
registerRoute(
  ({ request }) => request.mode === "navigate",
  new NetworkFirst({
    cacheName: "pages-cache",
    plugins: [
      new PrecacheFallbackPlugin({
        fallbackURL: "index.html",
      }) as unknown as WorkboxPlugin,
    ],
  }),
);
