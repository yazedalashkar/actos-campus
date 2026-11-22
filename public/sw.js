const CACHE_NAME = "actos-campus-v2";
const STATIC_ASSETS = ["/", "/manifest.json", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

  // 1) ملفات البناء الثابتة والأيقونات: Cache-First لفتح فوري بدون انتظار الشبكة
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".ico") ||
    url.pathname.endsWith(".woff2") ||
    url.pathname === "/manifest.json"
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // 2) فتح التطبيق (HTML): الشبكة بمهلة 1.5 ثانية فقط وإلا عرض النسخة المخزّنة فوراً
  if (request.mode === "navigate") {
    event.respondWith(
      new Promise((resolve) => {
        let settled = false;

        const serveCached = async () => {
          if (settled) return;
          const cached = (await caches.match(request)) || (await caches.match("/"));
          if (cached && !settled) {
            settled = true;
            resolve(cached);
          }
        };

        const timer = setTimeout(serveCached, 1500);

        fetch(request)
          .then((response) => {
            clearTimeout(timer);
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            if (!settled) {
              settled = true;
              resolve(response);
            }
          })
          .catch(async () => {
            clearTimeout(timer);
            const cached = (await caches.match(request)) || (await caches.match("/"));
            if (!settled) {
              settled = true;
              resolve(
                cached ||
                  new Response("لا يوجد اتصال بالإنترنت", {
                    status: 503,
                    headers: { "Content-Type": "text/plain; charset=utf-8" },
                  })
              );
            }
          });
      })
    );
    return;
  }

  // 3) بقية الملفات المحلية: مهلة سريعة والرجوع للكاش
  event.respondWith(
    Promise.race([
      fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 1500)),
    ]).catch(() => caches.match(request))
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      if (list.length > 0) return list[0].focus();
      return clients.openWindow("/");
    })
  );
});