// Basic service worker for KMP Dairy Farms
// Caches the app shell so the UI loads even with a flaky connection.
// Data (cow records, milk logs, etc.) still comes live from Supabase —
// this only caches static files like HTML/CSS/JS/icons, not your data.

const CACHE_NAME = "kmp-dairy-shell-v1";
const APP_SHELL = [
  "/kmp-dairy/",
  "/kmp-dairy/index.html",
  "/kmp-dairy/manifest.json"
  // add any local CSS/JS/icon files you have, e.g.:
  // "/kmp-dairy/icons/icon-192.png",
  // "/kmp-dairy/icons/icon-512.png",
];

// Install: pre-cache the app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: try network first (so you always get fresh app code + live Supabase data),
// fall back to cache only if offline
self.addEventListener("fetch", (event) => {
  // Never intercept Supabase API calls — those must always go live to the network
  if (event.request.url.includes("supabase.co")) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Update the cache with the fresh copy
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
