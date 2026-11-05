/* Nexus service worker: shows Web Push notifications and opens the related page on click. */
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { title: event.data && event.data.text() }; }
  event.waitUntil(
    self.registration.showNotification(d.title || 'Nexus', {
      body: d.body || '',
      icon: '/logo.png',
      badge: '/logo.png',
      tag: d.tag || undefined,
      data: { link: d.link || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.link || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.location.origin)) { c.focus(); return c.navigate(url); }
      }
      return self.clients.openWindow(url);
    }),
  );
});
