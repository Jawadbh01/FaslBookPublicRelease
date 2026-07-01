// FaslBook Service Worker v5 — Full offline-first
// App shell cached on install → served offline → Firebase handles data layer

const CACHE_NAME   = "faslbook-shell-v5";
const STATIC_CACHE = "faslbook-static-v5";

// App shell files to pre-cache so the React app loads fully offline
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/logo.png",
  "/icon-192.png",
  "/icon-512.png",
];

// ── Install: cache the app shell ──────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(
        SHELL_ASSETS.map((url) =>
          fetch(url).then((res) => {
            if (res.ok) return cache.put(url, res);
          }).catch(() => {})
        )
      )
    )
  );
  self.skipWaiting();
});

// ── Activate: clean old caches ────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== STATIC_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Helpers ───────────────────────────────────────────────────
function isFirebaseUrl(url) {
  return (
    url.includes("firestore.googleapis.com") ||
    url.includes("identitytoolkit.googleapis.com") ||
    url.includes("securetoken.googleapis.com") ||
    url.includes("firebase.googleapis.com") ||
    url.includes("storage.googleapis.com") ||
    url.includes("firebaseio.com") ||
    url.includes("fcm.googleapis.com") ||
    url.includes("googleapis.com/identitytoolkit")
  );
}

function isStaticAsset(url) {
  return /\.(png|jpg|jpeg|gif|webp|ico|svg|woff|woff2|ttf|eot|css|js)(\?|$)/.test(url);
}

function safeCacheResponse(cacheName, request, response) {
  if (response && response.ok && response.status === 200 && response.type !== "opaque") {
    caches.open(cacheName).then((cache) => {
      try { cache.put(request, response.clone()); } catch {}
    });
  }
}

// ── Fetch: network-first, always fall back to app shell ───────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = request.url;

  // Never intercept Firebase — it has its own offline queue
  if (request.method !== "GET") return;
  if (isFirebaseUrl(url)) return;

  // Static assets (JS/CSS/images): cache-first
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          safeCacheResponse(STATIC_CACHE, request, res);
          return res;
        }).catch(() => new Response("", { status: 404 }));
      })
    );
    return;
  }

  // Navigation (HTML pages): network-first, fall back to cached index.html
  // This lets React + wouter handle all routing client-side even when offline
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request, { credentials: "same-origin" })
        .then((res) => {
          // Cache the fresh response (this keeps index.html up to date)
          safeCacheResponse(CACHE_NAME, request, res);
          return res;
        })
        .catch(async () => {
          // Offline fallback: serve cached index.html so the full React app loads
          const cachedIndex = await caches.match("/index.html");
          if (cachedIndex) return cachedIndex;

          // Last resort: try cached root
          const cachedRoot = await caches.match("/");
          if (cachedRoot) return cachedRoot;

          // If nothing cached at all (very first visit offline), show simple message
          return new Response(
            `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>FaslBook</title></head>
            <body style="font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;background:#1B5E20;color:white;text-align:center;gap:12px;padding:24px">
            <h2>Open FaslBook online first</h2>
            <p style="opacity:.7;font-size:14px">Visit FaslBook while connected to the internet once, then it will work fully offline.</p>
            <button onclick="location.reload()" style="margin-top:16px;padding:14px 28px;background:white;color:#1B5E20;border:none;border-radius:14px;font-size:15px;font-weight:700;cursor:pointer">Try Again</button>
            </body></html>`,
            { status: 200, headers: { "Content-Type": "text/html" } }
          );
        })
    );
    return;
  }

  // Other GETs: network-first with cache fallback
  event.respondWith(
    fetch(request)
      .then((res) => {
        safeCacheResponse(CACHE_NAME, request, res);
        return res;
      })
      .catch(() => caches.match(request).then((c) => c || new Response("", { status: 404 })))
  );
});

// ── Message: force cache refresh ──────────────────────────────
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
  if (event.data === "CACHE_SHELL") {
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(SHELL_ASSETS.map((url) =>
        fetch(url).then((res) => { if (res.ok) cache.put(url, res); }).catch(() => {})
      ))
    ).then(() => {
      event.source?.postMessage("SHELL_CACHED");
    });
  }
});

// ── Push notifications ────────────────────────────────────────
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title || "FaslBook", {
      body:    data.body  || "",
      icon:    "/icon-192.png",
      badge:   "/icon-192.png",
      data:    data.data  || {},
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((list) => {
      for (const c of list) {
        if ("focus" in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow("/overview");
    })
  );
});
