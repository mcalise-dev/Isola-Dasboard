// Isola On The Go — offline read cache (v4.3, 9/23/26)
// Network first for pages and database reads; when the network fails, the last good copy
// is served instead. Writes (POST/PATCH/DELETE) are never cached or replayed.
// Landing on /login (signing out) wipes the saved data.
const STATIC = "isola-static-v1";
const DATA = "isola-data-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keep = [STATIC, DATA];
    for (const k of await caches.keys()) if (!keep.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req);
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Supabase table reads
  if (url.hostname.endsWith(".supabase.co")) {
    if (url.pathname.startsWith("/rest/v1/")) e.respondWith(networkFirst(req, DATA));
    return; // auth, storage, realtime: straight to the network
  }
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(caches.open(STATIC).then(async (c) => (await c.match(req)) || fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; })));
    return;
  }
  if (url.pathname.startsWith("/cal/") || url.pathname.startsWith("/p/") || url.pathname.startsWith("/clock")) return;
  if (url.pathname.startsWith("/login")) { e.waitUntil(caches.delete(DATA)); return; }

  if (req.mode === "navigate" || req.headers.get("RSC") === "1") e.respondWith(networkFirst(req, DATA));
});

// ── Push alerts (v4.9) ── payload: { title, body, url, tag }
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : "" }; }
  const title = d.title || "Isola";
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || "",
    tag: d.tag || undefined,
    renotify: !!d.tag,
    data: { url: d.url || "/" },
    icon: "/icon-192.png",
    badge: "/icon-192.png",
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of wins) {
      if (new URL(c.url).origin !== self.location.origin) continue;
      try {
        const focused = await c.focus();
        if ("navigate" in focused) await focused.navigate(target);
        return;
      } catch {}
    }
    await self.clients.openWindow(target);
  })());
});
