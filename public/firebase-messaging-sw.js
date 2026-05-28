importScripts("https://www.gstatic.com/firebasejs/11.0.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.0.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDD7xkobHBI0eoty6XuWCoJ-R4-mfa9S4M",
  authDomain: "ribuim.firebaseapp.com",
  projectId: "ribuim",
  storageBucket: "ribuim.firebasestorage.app",
  messagingSenderId: "141305632469",
  appId: "1:141305632469:web:09a2af3d3d2a645312f45c"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "Ribuim Reminder";
  const body = payload.notification?.body || "A reminder needs your attention";
  const noteId = payload.data?.noteId || "";
  self.registration.showNotification(title, {
    body,
    icon: "/ribuim.png",
    tag: noteId ? "ribuim-" + noteId : "ribuim-reminder",
    data: { url: self.location.origin }
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || self.location.origin;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.startsWith(url) && "focus" in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
