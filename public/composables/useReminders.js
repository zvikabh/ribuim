import { ref, watch } from "vue";
import { useNotes } from "./useNotes.js";
import { usePushNotifications } from "./usePushNotifications.js";

const { notes, markReminderDone, dismissReminder } = useNotes();
const { registerPush } = usePushNotifications();

const activeBanners = ref([]);
const notifiedNoteIds = new Set();
const notificationPermission = ref(
  typeof Notification !== "undefined" ? Notification.permission : "default"
);

const CHECK_INTERVAL_MS = 30_000;

function toMs(ts) {
  if (!ts) return null;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (ts instanceof Date) return ts.getTime();
  return null;
}

function checkDueReminders() {
  const now = Date.now();
  for (const note of notes.value) {
    const due = toMs(note.reminderAt);
    if (!due) continue;
    if (note.reminderDone) continue;
    if (note.reminderDismissed) continue;
    if (due > now) continue;
    if (notifiedNoteIds.has(note.id)) continue;

    notifiedNoteIds.add(note.id);

    if (!activeBanners.value.find(b => b.id === note.id)) {
      activeBanners.value.push({
        id: note.id,
        title: note.title || "(untitled note)"
      });
    }

    if (typeof Notification !== "undefined" &&
        Notification.permission === "granted" &&
        document.visibilityState !== "visible") {
      try {
        new Notification("Ribuim Reminder", {
          body: note.title || "Checklist reminder",
          tag: "ribuim-" + note.id
        });
      } catch (err) {
        console.warn("Notification failed:", err);
      }
    }
  }
}

watch(notes, (current) => {
  const currentIds = new Set(current.map(n => n.id));
  for (const id of [...notifiedNoteIds]) {
    if (!currentIds.has(id)) notifiedNoteIds.delete(id);
  }
  for (const note of current) {
    const due = toMs(note.reminderAt);
    if (!due || note.reminderDone || note.reminderDismissed || due > Date.now()) {
      if (notifiedNoteIds.has(note.id)) {
        notifiedNoteIds.delete(note.id);
      }
    }
  }
  activeBanners.value = activeBanners.value.filter(b => {
    const note = current.find(n => n.id === b.id);
    if (!note) return false;
    if (note.reminderDone) return false;
    if (note.reminderDismissed) return false;
    if (!note.reminderAt) return false;
    return true;
  });

  checkDueReminders();
}, { deep: true });

setInterval(checkDueReminders, CHECK_INTERVAL_MS);

async function dismissBanner(noteId) {
  activeBanners.value = activeBanners.value.filter(b => b.id !== noteId);
  await dismissReminder(noteId);
}

async function bannerMarkDone(noteId) {
  dismissBanner(noteId);
  await markReminderDone(noteId);
}

async function requestNotificationPermission() {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") {
    const result = await Notification.requestPermission();
    notificationPermission.value = result;
    if (result === "granted") {
      registerPush();
    }
  }
}

export function useReminders() {
  return {
    activeBanners,
    dismissBanner,
    bannerMarkDone,
    notificationPermission,
    requestNotificationPermission
  };
}
