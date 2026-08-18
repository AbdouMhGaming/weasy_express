// Weasy Express — Service Worker
// Handles Web Push notifications and notification click events.

self.addEventListener("push", (event) => {
  let data = { title: "Weasy Express", body: "", url: "/" };
  try {
    data = { ...data, ...event.data.json() };
  } catch (_) {
    if (event.data) data.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/logo.png",
      badge: "/favicon.svg",
      data: { url: data.url },
      // Show even when the app is in the foreground
      requireInteraction: false,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url ?? "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // Focus an existing tab if it already has this URL open
        for (const client of windowClients) {
          if (
            (client.url.includes("/admin") || client.url.includes("/expediteurs")) &&
            "focus" in client
          ) {
            return client.focus();
          }
        }
        // Otherwise open a new window
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});
