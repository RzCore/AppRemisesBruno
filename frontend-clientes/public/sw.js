// ==============================================================================
// SERVICE WORKER - REMISES BRUNO (APP CLIENTES)
// Notificaciones Push en segundo plano cuando el móvil está asignado o en puerta
// ==============================================================================

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const title = data.title || '🚕 Remises Bruno';

    const options = {
      body: data.body || 'Actualización sobre tu viaje en curso.',
      icon: data.icon || '/pwa-192x192.png',
      badge: data.badge || '/pwa-192x192.png',
      vibrate: data.vibrate || [300, 150, 300, 150, 450],
      tag: data.tag || 'estado-viaje-cliente',
      renotify: true,
      requireInteraction: data.requireInteraction !== undefined ? data.requireInteraction : true,
      data: {
        url: data.url || '/cliente/app',
        ...(data.data || {}),
      },
      actions: [
        {
          action: 'open_trip',
          title: '📍 Ver mi remís',
        },
      ],
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    console.error('Error mostrando notificación push en SW Clientes:', err);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/cliente/app';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
