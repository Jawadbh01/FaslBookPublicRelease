// FaslBook Service Worker v4
// Full offline support with proper caching strategy

const CACHE_NAME   = "faslbook-pages-v4";
const STATIC_CACHE = "faslbook-static-v4";

const INSTALL_ASSETS = [
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/logo.png",
  "/banner.png",
];

// ── Install ──────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      Promise.allSettled(
        INSTALL_ASSETS.map((url) =>
          fetch(url).then((res) => {
            if (res.ok) return cache.put(url, res);
          }).catch(() => {})
        )
      )
    )
  );
  self.skipWaiting();
});

// ── Activate ─────────────────────────────────────────────────
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
  return (
    url.includes("/_next/static/") ||
    url.includes("/_next/image") ||
    /\.(png|jpg|jpeg|gif|webp|ico|svg|woff|woff2|ttf|eot|css)(\?|$)/.test(url)
  );
}

function safeCacheResponse(cacheName, request, response) {
  if (response && response.ok && response.status === 200 && response.type !== "opaque") {
    caches.open(cacheName).then((cache) => {
      try { cache.put(request, response.clone()); } catch {}
    });
  }
}

const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>FaslBook — Offline</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
         display:flex;flex-direction:column;align-items:center;justify-content:center;
         min-height:100vh;background:#1B5E20;color:#fff;text-align:center;gap:12px;padding:24px}
    .logo{width:100px;height:100px;object-fit:cover;border-radius:22px;margin-bottom:8px;box-shadow:0 8px 32px rgba(0,0,0,0.3)}
    h1{font-size:24px;font-weight:800;color:#fff}
    .sub{font-size:13px;color:rgba(255,255,255,0.7);max-width:260px;line-height:1.5}
    .badge{background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);
           border-radius:20px;padding:6px 16px;font-size:12px;color:rgba(255,255,255,0.8);margin-top:4px}
    button{margin-top:16px;padding:14px 32px;background:#fff;color:#1B5E20;
           border:none;border-radius:14px;font-size:15px;font-weight:700;cursor:pointer;
           box-shadow:0 4px 16px rgba(0,0,0,0.2)}
  </style>
</head>
<body>
  <img src="/logo.png" class="logo" alt="FaslBook" onerror="this.style.display='none'"/>
  <h1>FaslBook</h1>
  <p class="sub">Manage Your Farm. Grow Your Profit.</p>
  <div class="badge">📶 Offline Mode — Data saved locally</div>
  <p class="sub" style="font-size:12px">Connect to internet to sync your data</p>
  <button onclick="window.location.reload()">🔄 Try Again</button>
</body>
</html>`;

// ── Fetch ─────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = request.url;

  if (request.method !== "GET") return;
  if (isFirebaseUrl(url)) return;

  // Static assets: cache-first
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

  // Navigation: network-first, cache fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request, { credentials: "same-origin" })
        .then((res) => {
          safeCacheResponse(CACHE_NAME, request, res);
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          // Try overview (app shell)
          const shell = await caches.match("/overview");
          if (shell) return shell;
          // Fallback offline page
          return new Response(OFFLINE_HTML, {
            status: 200,
            headers: { "Content-Type": "text/html" },
          });
        })
    );
    return;
  }

  // Other GETs: network-first
  event.respondWith(
    fetch(request)
      .then((res) => {
        safeCacheResponse(CACHE_NAME, request, res);
        return res;
      })
      .catch(() => caches.match(request).then((c) => c || new Response("", { status: 404 })))
  );
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
