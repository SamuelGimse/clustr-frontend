self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let message = {};
  try { message = event.data?.json() || {}; } catch {}
  event.waitUntil(self.registration.showNotification(message.title || 'New Clustr report', {
    body: message.body || 'A new market report is ready.', icon: '/icons/icon-192.png',
    tag: message.tag || 'clustr-publish', data: { url: message.url || '/' }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  let url;
  try { url = new URL(event.notification.data?.url || '/', self.location.origin); } catch { url = new URL('/', self.location.origin); }
  if (url.origin !== self.location.origin) url = new URL('/', self.location.origin);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) { const target = await existing.navigate(url.href); return (target || existing).focus(); }
    return self.clients.openWindow(url.href);
  })());
});
