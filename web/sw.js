// Word's service worker: keeps a copy of the page's files so it opens with no connection, which is also what
// lets phones and computers install it as an app. Files still come from the network whenever it answers, so
// a new release arrives just as it does in the browser; the copies are only used offline.

const CACHE = "guess-word";
const FILES = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "helpers.js",
  "words.js",
  "clock.js",
  "duel.js",
  "trystero.js",
  "manifest.webmanifest",
  "icon.png",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable.png",
  "fonts/poppins-400.woff2",
  "fonts/poppins-600.woff2",
  "fonts/poppins-700.woff2",
];

self.addEventListener("install", (event) => {
  self.skipWaiting(); // the fetch rules below never change what the page sees online, so take over straight away
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
});

self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Only the page's own files: other projects on the same github.io address are left alone.
  if (request.method !== "GET" || !request.url.startsWith(self.registration.scope)) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
        }
        return response;
      })
      .catch(async () => (await caches.match(request, { ignoreSearch: true })) || Response.error()),
  );
});
