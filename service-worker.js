const CACHE_NAME = "mon-cocon-v2";
const ASSETS_TO_CACHE = [
  "/index.html",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

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

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const isHTML =
    req.mode === "navigate" ||
    req.destination === "document" ||
    req.url.endsWith("/index.html") ||
    req.url.endsWith("/");

  if (isHTML) {
    // Network-first : on va toujours chercher la dernière version en ligne.
    // Le cache ne sert que de secours si l'utilisatrice est hors-ligne.
    event.respondWith(
      fetch(req)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return response;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Cache-first pour les assets statiques (icônes, manifest) qui changent rarement
  event.respondWith(
    caches.match(req).then((cached) => {
      return (
        cached ||
        fetch(req)
          .then((response) => {
            if (req.method === "GET" && response && response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
            }
            return response;
          })
          .catch(() => cached)
      );
    })
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try{ data = event.data ? event.data.json() : {}; }catch(e){}
  const title = data.title || "💧 Rappel hydratation";
  const options = {
    body: data.body || "Petit rappel tout en douceur : pense à boire un verre d'eau !",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || "hydratation-reminder",
    data: data
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data && event.notification.data.type === "weekly-tracking"
    ? "/index.html?openTracker=1"
    : "/";
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      for(const client of clientList){
        if("navigate" in client) client.navigate(targetUrl);
        if("focus" in client) return client.focus();
      }
      if(clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
