// Service worker: makes the app installable and keeps the shell usable offline.
// API calls and photos always go to the network. The shell and the bundle it loads are cached at
// install; icons and diagram thumbnails are cached as they load.
const VERSION = "v2";
const SHELL_CACHE = `shell-${VERSION}`;
const STATIC_CACHE = `static-${VERSION}`;
const SHELL = ["/", "/manifest.webmanifest", "/favicon.svg", "/icons/icon-192.png", "/icons/icon-512.png"];
// The static cache keeps only its newest entries, so old bundles don't pile up.
const STATIC_LIMIT = 200;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      // The page registers this worker after its bundle has loaded, so fetch the bundle that
      // index.html points at now. Otherwise the first launch without a network is blank.
      const html = await (await fetch("/", { cache: "no-cache" })).text();
      const assets = new Set([...html.matchAll(/(?:src|href)="([/]assets[/][^"]+)"/g)].map((match) => match[1]));
      await (await caches.open(SHELL_CACHE)).addAll(SHELL);
      await (await caches.open(STATIC_CACHE)).addAll([...assets]);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !key.endsWith(VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

/** Deletes the oldest entries past STATIC_LIMIT; cache.keys() lists them oldest first. */
async function trim(cache) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - STATIC_LIMIT)).map((key) => cache.delete(key)));
}

/** A missing file comes back as the app's index.html, which mustn't be cached under its URL. */
function cacheable(response) {
  return response.ok && !(response.headers.get("content-type") ?? "").includes("text/html");
}

/** Saves a copy of the response in the cache, inside the event's lifetime; the static cache is then trimmed. */
function save(event, cache, response, trimmed) {
  if (!cacheable(response)) return;
  const copy = response.clone();
  event.waitUntil(cache.put(event.request, copy).then(() => (trimmed ? trim(cache) : undefined)));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // The API, photos, the diagram pages in /learn and security.txt aren't part of the app shell.
  // Photos need the API to show up at all, and the network keeps their hour-long browser cache and
  // the 404 for a rejected post's photo in force.
  if (url.origin !== self.location.origin || /^\/(api|img|learn|\.well-known)\//.test(url.pathname)) return;

  // Pages: network first, falling back to the cached shell when offline. Only a real page replaces
  // the cached shell, never a text file or an error page opened in a tab.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && (response.headers.get("content-type") ?? "").includes("text/html")) {
            const copy = response.clone();
            event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.put("/", copy)));
          }
          return response;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }

  // Hashed bundles never change: cache first.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        save(event, cache, response, true);
        return response;
      }),
    );
    return;
  }

  // The manifest, icons and diagram thumbnails keep their names when they change: answer from the
  // cache at once, and refresh the cached copy in the background for next time.
  const shellFile = SHELL.includes(url.pathname);
  if (shellFile || /^\/(icons|diagrams)\//.test(url.pathname)) {
    event.respondWith(
      caches.open(shellFile ? SHELL_CACHE : STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        const refresh = fetch(request).then((response) => {
          save(event, cache, response, !shellFile);
          return response;
        });
        if (!hit) return refresh;
        event.waitUntil(refresh.catch(() => undefined));
        return hit;
      }),
    );
  }
});
