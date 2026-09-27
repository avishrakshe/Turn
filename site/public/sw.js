// Turn service worker: makes the installed app open and work offline.
//   Pages: network first, falling back to the last copy of that page, then to the /app shell.
//   Hashed build assets and icons: cache first; their URLs change whenever they do.
//   Exchange rates: network first, falling back to the last rates seen.
// Next's in-app data requests (RSC) are left alone: offline they fail, Next then loads the
// page normally, and that load is served from here. Only full HTML documents are kept as
// pages, so a data payload can never be shown in place of a page.
// Only same-origin GETs are handled. Bump VERSION to drop old caches.
const VERSION = "v3";
const PAGES = `turn-pages-${VERSION}`;
const ASSETS = `turn-assets-${VERSION}`;
const DATA = `turn-data-${VERSION}`;
// The app's fixed screens. Circle and invite pages are kept as they're visited (see "message").
const SHELL = ["/app", "/app/score", "/app/settings", "/app/create", "/app/get"];

const isHtml = (response) => response.ok && response.type === "basic" && (response.headers.get("content-type") || "").includes("text/html");

async function keepPage(request, response) {
  if (isHtml(response)) await (await caches.open(PAGES)).put(request, response);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(ASSETS).then((cache) => cache.add("/icons/icon-192.png")),
      ...SHELL.map((path) => fetch(path).then((response) => keepPage(new Request(path), response))),
    ]).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("turn-") && ![PAGES, ASSETS, DATA].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// In-app navigation never loads a full page, so the app tells us which pages it has shown and
// we keep a copy of each: a circle opened once still opens offline.
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "cache-page" || typeof data.path !== "string" || !data.path.startsWith("/app")) return;
  const request = new Request(new URL(data.path, self.location.origin));
  event.waitUntil(
    fetch(request)
      .then((response) => keepPage(request, response))
      .catch(() => {}),
  );
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) (await caches.open(ASSETS)).put(request, response.clone());
  return response;
}

async function page(request, url) {
  try {
    const response = await fetch(request);
    await keepPage(request, response.clone());
    return response;
  } catch (error) {
    // ignoreSearch: the installed app opens /app?source=pwa, the same page as /app.
    const cached = (await caches.match(request, { cacheName: PAGES, ignoreSearch: true })) || (url.pathname.startsWith("/app") && (await caches.match("/app", { cacheName: PAGES })));
    if (cached) return cached;
    throw error;
  }
}

async function data(request) {
  try {
    const response = await fetch(request);
    if (response.ok) (await caches.open(DATA)).put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await caches.match(request, { cacheName: DATA });
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) event.respondWith(cacheFirst(request));
  else if (request.mode === "navigate") event.respondWith(page(request, url));
  else if (url.pathname === "/api/fx") event.respondWith(data(request));
});
