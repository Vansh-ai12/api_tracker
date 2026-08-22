self.addEventListener("push", function (event) {
  let data = { title: "Unsub", body: "You have a subscription reminder." };

  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (err) {
    console.error("[sw] Failed to parse push data:", err);
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      data: { url: data.url || "/dashboard" },
    }),
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : "/dashboard";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (clientList) {
        // If a tab with the target URL is already open, focus it.
        for (const client of clientList) {
          if (client.url.includes(targetUrl) && "focus" in client) {
            return client.focus();
          }
        }
        // Otherwise open a new tab.
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      }),
  );
});