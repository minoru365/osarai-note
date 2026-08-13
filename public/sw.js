const CACHE_NAME = "study-support-shell-v1";
const scopeUrl = new URL("./", self.registration.scope);
const appShell = [
  scopeUrl.href,
  new URL("app.webmanifest", scopeUrl).href,
  new URL("icon.svg", scopeUrl).href,
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(appShell);

    const manifestUrl = new URL("content/manifest.json", scopeUrl);
    const manifestResponse = await fetch(manifestUrl, { cache: "no-cache" });
    if (!manifestResponse.ok) throw new Error("Content manifest could not be cached");
    await cache.put(manifestUrl, manifestResponse.clone());
    const manifest = await manifestResponse.json();
    const packUrls = Array.isArray(manifest.packs)
      ? manifest.packs
        .filter((pack) => typeof pack?.url === "string" && !pack.url.includes("..") && !pack.url.startsWith("/"))
        .map((pack) => new URL(`content/${pack.url}`, scopeUrl).href)
      : [];
    await cache.addAll(packUrls);
  })());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== scopeUrl.origin || !url.pathname.startsWith(scopeUrl.pathname)) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      return cache.match(scopeUrl.href);
    }));
    return;
  }

  if (url.pathname.endsWith("/content/manifest.json")) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});
