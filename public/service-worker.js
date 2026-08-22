self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data?.json() || {};
  } catch {
    message = { body: event.data?.text() || "A grade was updated." };
  }

  event.waitUntil(
    self.registration.showNotification(message.title || "Moofie grade update", {
      body: message.body || "A grade was updated in Canvas.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: message.tag || "moofie-grade-update",
      data: { url: message.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = new URL(event.notification.data?.url || "/", self.location.origin)
    .href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(
      (clients) => {
        const existing = clients.find((client) => client.url.startsWith(self.location.origin));
        if (existing) {
          existing.navigate(destination);
          return existing.focus();
        }
        return self.clients.openWindow(destination);
      },
    ),
  );
});
