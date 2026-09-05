importScripts("https://storage.googleapis.com/workbox-cdn/releases/7.0.0/workbox-sw.js");

if (workbox) {
  // Precache the assets injected by VitePWA
  workbox.precaching.precacheAndRoute(self.__WB_MANIFEST || []);

  // Cache Google Fonts stylesheets
  workbox.routing.registerRoute(
    /^https:\/\/fonts\.googleapis\.com\/.*/i,
    new workbox.strategies.CacheFirst({
      cacheName: "google-fonts-cache",
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 10,
          maxAgeSeconds: 60 * 60 * 24 * 365,
        }),
      ],
    }),
  );

  // Cache Google Fonts webfonts
  workbox.routing.registerRoute(
    /^https:\/\/fonts\.gstatic\.com\/.*/i,
    new workbox.strategies.CacheFirst({
      cacheName: "gstatic-fonts-cache",
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 10,
          maxAgeSeconds: 60 * 60 * 24 * 365,
        }),
      ],
    }),
  );

  // SPA navigation fallback to index.html
  workbox.routing.registerRoute(
    ({ request }) => request.mode === "navigate",
    new workbox.strategies.NetworkFirst({
      cacheName: "pages-cache",
      plugins: [
        new workbox.precaching.PrecacheFallbackPlugin({
          fallbackURL: "index.html",
        }),
      ],
    }),
  );
} else {
  console.error("Workbox failed to load.");
}
