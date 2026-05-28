import { ref, watch } from "vue";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { app, db, vapidKey } from "../firebase-init.js";
import { useAuth } from "./useAuth.js";

const { currentUser } = useAuth();
const pushSupported = ref(false);
const pushRegistered = ref(false);
let messaging = null;

function isSupported() {
  return typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "Notification" in window &&
    "PushManager" in window &&
    !!vapidKey;
}

function tokenHash(token) {
  let h = 0;
  for (let i = 0; i < token.length; i++) {
    h = ((h << 5) - h + token.charCodeAt(i)) | 0;
  }
  return "tok_" + (h >>> 0).toString(36);
}

async function registerPush() {
  if (!isSupported()) return;
  if (!currentUser.value?.email) return;
  if (typeof Notification !== "undefined" && Notification.permission !== "granted") return;

  try {
    if (!messaging) messaging = getMessaging(app);

    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: await navigator.serviceWorker.register("/firebase-messaging-sw.js")
    });

    if (!token) return;

    const docId = tokenHash(token);
    await setDoc(doc(db, "fcmTokens", docId), {
      ownerEmail: currentUser.value.email,
      token,
      updatedAt: serverTimestamp()
    });

    pushRegistered.value = true;
  } catch (err) {
    console.warn("Push registration failed:", err);
  }
}

function setupForegroundHandler() {
  if (!messaging) return;
  onMessage(messaging, (payload) => {
    const title = payload.data?.title || "Ribuim Reminder";
    const body = payload.data?.body || "";
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(title, {
        body,
        icon: "/ribuim.png",
        tag: payload.data?.noteId ? "ribuim-" + payload.data.noteId : "ribuim-reminder"
      });
    }
  });
}

pushSupported.value = isSupported();

watch(currentUser, async (user) => {
  if (user?.email && pushSupported.value) {
    await registerPush();
    setupForegroundHandler();
  }
});

export function usePushNotifications() {
  return { pushSupported, pushRegistered, registerPush };
}
