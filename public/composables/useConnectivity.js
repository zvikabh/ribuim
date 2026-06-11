import { ref, computed } from "vue";

// Show an "offline" warning once we've been unable to sync for this long.
const OFFLINE_THRESHOLD_MS = 60_000;

const online = ref(typeof navigator === "undefined" ? true : navigator.onLine);
const lastSyncAt = ref(Date.now());
const now = ref(Date.now());

// Called when we've confirmed we're synced — on reconnect, and whenever a
// Firestore snapshot arrives straight from the server (not the local cache).
function markSynced() {
  online.value = true;
  lastSyncAt.value = Date.now();
}

if (typeof window !== "undefined") {
  window.addEventListener("online", markSynced);
  window.addEventListener("offline", () => { online.value = false; });

  setInterval(() => {
    now.value = Date.now();
    // While the device reports a network connection we treat ourselves as
    // synced — Firestore reconnects and flushes queued writes on its own. When
    // the connection drops, lastSyncAt freezes and the gap grows until the
    // warning appears; it clears as soon as we're back online.
    if (navigator.onLine) {
      online.value = true;
      lastSyncAt.value = Date.now();
    } else {
      online.value = false;
    }
  }, 5000);
}

const offlineMs = computed(() => now.value - lastSyncAt.value);
const showOfflineWarning = computed(() => offlineMs.value > OFFLINE_THRESHOLD_MS);
const minutesSinceSync = computed(() => Math.max(1, Math.floor(offlineMs.value / 60_000)));

export function useConnectivity() {
  return { online, showOfflineWarning, minutesSinceSync, markSynced };
}
