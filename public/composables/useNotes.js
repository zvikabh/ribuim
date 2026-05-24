import { ref, computed, watch } from "vue";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  deleteField,
  Timestamp
} from "firebase/firestore";
import { db } from "../firebase-init.js";
import { useAuth } from "./useAuth.js";

const { currentUser } = useAuth();

const notes = ref([]);
const loading = ref(false);
const accessDenied = ref(false);

let unsubscribeListener = null;

function applyDocChanges(snapshot) {
  snapshot.docChanges().forEach((change) => {
    const data = { id: change.doc.id, ...change.doc.data() };
    if (change.type === "added") {
      const idx = notes.value.findIndex(n => n.id === data.id);
      if (idx === -1) notes.value.push(data);
      else notes.value[idx] = data;
    } else if (change.type === "modified") {
      const idx = notes.value.findIndex(n => n.id === data.id);
      if (idx !== -1) notes.value[idx] = data;
      else notes.value.push(data);
    } else if (change.type === "removed") {
      notes.value = notes.value.filter(n => n.id !== data.id);
    }
  });
}

function startListener(email) {
  stopListener();
  loading.value = true;
  accessDenied.value = false;
  const q = query(collection(db, "notes"), where("ownerEmail", "==", email));
  unsubscribeListener = onSnapshot(q,
    (snapshot) => {
      applyDocChanges(snapshot);
      loading.value = false;
    },
    (error) => {
      loading.value = false;
      if (error.code === "permission-denied") {
        accessDenied.value = true;
      } else {
        console.error("Notes listener error:", error);
      }
    }
  );
}

function stopListener() {
  if (unsubscribeListener) {
    unsubscribeListener();
    unsubscribeListener = null;
  }
  notes.value = [];
}

watch(currentUser, (user) => {
  if (user?.email) startListener(user.email);
  else { stopListener(); accessDenied.value = false; }
}, { immediate: true });

const sortedNotes = computed(() => {
  const toMs = (ts) => ts && typeof ts.toMillis === "function" ? ts.toMillis() : 0;

  const withReminder = notes.value
    .filter(n => n.reminderAt && !n.reminderDone)
    .sort((a, b) => toMs(a.reminderAt) - toMs(b.reminderAt));

  const withoutReminder = notes.value
    .filter(n => !n.reminderAt || n.reminderDone)
    .sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));

  return [...withReminder, ...withoutReminder];
});

function newItemId() {
  if (window.crypto && window.crypto.randomUUID) {
    return "item_" + window.crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  }
  return "item_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function createNote() {
  const email = currentUser.value?.email;
  if (!email) return null;
  const docRef = await addDoc(collection(db, "notes"), {
    ownerEmail: email,
    title: "",
    createdAt: serverTimestamp(),
    reminderAt: null,
    reminderRecurrence: "none",
    reminderDone: false,
    items: {},
    itemOrder: [],
    labels: []
  });
  return docRef.id;
}

async function addLabel(noteId, label) {
  const trimmed = (label || "").trim();
  if (!trimmed) return;
  try {
    await updateDoc(doc(db, "notes", noteId), {
      labels: arrayUnion(trimmed)
    });
  } catch (err) {
    if (err.code !== "not-found") throw err;
  }
}

async function removeLabel(noteId, label) {
  try {
    await updateDoc(doc(db, "notes", noteId), {
      labels: arrayRemove(label)
    });
  } catch (err) {
    if (err.code !== "not-found") throw err;
  }
}

// Returns the next occurrence of a recurring rule strictly after `now`.
// `template` is the reference Date that carries the time-of-day (and weekday, for weekly).
// Returns a Date or null for unsupported recurrence.
function nextOccurrenceAfter(now, recurrence, template) {
  if (!template) return null;
  if (recurrence === "daily") {
    const next = new Date(now);
    next.setHours(template.getHours(), template.getMinutes(), 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next;
  }
  if (recurrence === "weekly") {
    const next = new Date(now);
    next.setHours(template.getHours(), template.getMinutes(), 0, 0);
    const targetDay = template.getDay();
    const daysAhead = (targetDay - next.getDay() + 7) % 7;
    next.setDate(next.getDate() + daysAhead);
    if (next <= now) next.setDate(next.getDate() + 7);
    return next;
  }
  return null;
}

async function deleteNote(noteId) {
  await deleteDoc(doc(db, "notes", noteId));
}

async function updateTitle(noteId, title) {
  try {
    await updateDoc(doc(db, "notes", noteId), { title });
  } catch (err) {
    if (err.code !== "not-found") throw err;
  }
}

// Normalizes the picked Timestamp for a recurring rule so the first stored
// reminderAt is the next occurrence at or after now. One-shot reminders are
// stored as the user picked them (a past one-shot just shows as overdue).
function normalizeForRecurrence(reminderAt, recurrence) {
  if (recurrence !== "daily" && recurrence !== "weekly") return reminderAt;
  const picked = reminderAt && typeof reminderAt.toDate === "function"
    ? reminderAt.toDate() : null;
  if (!picked) return reminderAt;
  const now = new Date();
  if (picked > now) return reminderAt;
  const next = nextOccurrenceAfter(now, recurrence, picked);
  return next ? Timestamp.fromDate(next) : reminderAt;
}

async function setReminder(noteId, reminderAt, recurrence = "none") {
  await updateDoc(doc(db, "notes", noteId), {
    reminderAt: normalizeForRecurrence(reminderAt, recurrence),
    reminderRecurrence: recurrence,
    reminderDone: false
  });
}

async function clearReminder(noteId) {
  await updateDoc(doc(db, "notes", noteId), {
    reminderAt: null,
    reminderRecurrence: "none",
    reminderDone: false
  });
}

// For one-shot reminders, sets reminderDone:true (dismissed permanently).
// For recurring reminders, advances reminderAt to the next occurrence strictly
// after max(now, current reminderAt). This makes Done idempotent for past-due
// reminders ("next future slot") while still advancing one slot if pressed early.
async function markReminderDone(noteId) {
  const note = notes.value.find(n => n.id === noteId);
  const recurrence = note?.reminderRecurrence || "none";
  if (recurrence === "none") {
    await updateDoc(doc(db, "notes", noteId), { reminderDone: true });
    return;
  }
  const template = note?.reminderAt && typeof note.reminderAt.toDate === "function"
    ? note.reminderAt.toDate() : null;
  const now = new Date();
  const reference = template && template.getTime() > now.getTime() ? template : now;
  const next = nextOccurrenceAfter(reference, recurrence, template);
  if (!next) {
    await updateDoc(doc(db, "notes", noteId), { reminderDone: true });
    return;
  }
  const update = {
    reminderAt: Timestamp.fromDate(next),
    reminderDone: false
  };
  const items = note?.items;
  if (items && typeof items === "object") {
    for (const itemId of Object.keys(items)) {
      if (items[itemId]?.checked) {
        update[`items.${itemId}.checked`] = false;
      }
    }
  }
  await updateDoc(doc(db, "notes", noteId), update);
}

async function addItem(noteId, label = "") {
  const itemId = newItemId();
  await updateDoc(doc(db, "notes", noteId), {
    [`items.${itemId}`]: { label, checked: false },
    itemOrder: arrayUnion(itemId)
  });
  return itemId;
}

async function insertItem(noteId, label, newOrder, itemId = null) {
  const id = itemId || newItemId();
  await updateDoc(doc(db, "notes", noteId), {
    [`items.${id}`]: { label, checked: false },
    itemOrder: newOrder.map(x => x === "__NEW__" ? id : x)
  });
  return id;
}

async function deleteItem(noteId, itemId) {
  await updateDoc(doc(db, "notes", noteId), {
    [`items.${itemId}`]: deleteField(),
    itemOrder: arrayRemove(itemId)
  });
}

async function setItemChecked(noteId, itemId, checked) {
  await updateDoc(doc(db, "notes", noteId), {
    [`items.${itemId}.checked`]: checked
  });
}

async function setItemLabel(noteId, itemId, label) {
  try {
    await updateDoc(doc(db, "notes", noteId), {
      [`items.${itemId}.label`]: label
    });
  } catch (err) {
    if (err.code !== "not-found") throw err;
  }
}

async function setItemOrder(noteId, itemOrder) {
  await updateDoc(doc(db, "notes", noteId), { itemOrder });
}

export function useNotes() {
  return {
    notes,
    sortedNotes,
    loading,
    accessDenied,
    createNote,
    deleteNote,
    updateTitle,
    setReminder,
    clearReminder,
    markReminderDone,
    addItem,
    insertItem,
    deleteItem,
    setItemChecked,
    setItemLabel,
    setItemOrder,
    addLabel,
    removeLabel,
    newItemId
  };
}
