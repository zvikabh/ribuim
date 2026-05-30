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

let unsubOwned = null;
let unsubShared = null;
const ownedNotes = new Map();
const sharedNotes = new Map();

function mergeNotes(email) {
  const merged = [];
  for (const [id, data] of ownedNotes) {
    merged.push({ ...data, id, _isOwner: true });
  }
  for (const [id, data] of sharedNotes) {
    if (!ownedNotes.has(id)) {
      merged.push({ ...data, id, _isOwner: false });
    }
  }
  notes.value = merged;
}

function applyDocChanges(map, snapshot, email) {
  snapshot.docChanges().forEach((change) => {
    const data = change.doc.data();
    if (change.type === "removed") {
      map.delete(change.doc.id);
    } else {
      map.set(change.doc.id, data);
    }
  });
  mergeNotes(email);
}

function startListener(email) {
  stopListener();
  loading.value = true;
  accessDenied.value = false;
  let ownedReady = false, sharedReady = false;

  const q1 = query(collection(db, "notes"), where("ownerEmail", "==", email));
  unsubOwned = onSnapshot(q1,
    (snapshot) => {
      applyDocChanges(ownedNotes, snapshot, email);
      ownedReady = true;
      if (ownedReady && sharedReady) loading.value = false;
    },
    (error) => {
      loading.value = false;
      if (error.code === "permission-denied") accessDenied.value = true;
      else console.error("Owned notes listener error:", error);
    }
  );

  const q2 = query(collection(db, "notes"), where("sharedWith", "array-contains", email));
  unsubShared = onSnapshot(q2,
    (snapshot) => {
      applyDocChanges(sharedNotes, snapshot, email);
      sharedReady = true;
      if (ownedReady && sharedReady) loading.value = false;
    },
    (error) => {
      console.warn("Shared notes listener error:", error);
      sharedReady = true;
      if (ownedReady && sharedReady) loading.value = false;
    }
  );
}

function stopListener() {
  if (unsubOwned) { unsubOwned(); unsubOwned = null; }
  if (unsubShared) { unsubShared(); unsubShared = null; }
  ownedNotes.clear();
  sharedNotes.clear();
  notes.value = [];
}

watch(currentUser, (user) => {
  if (user?.email) startListener(user.email);
  else { stopListener(); accessDenied.value = false; }
}, { immediate: true });

const activeNotes = computed(() => notes.value.filter(n => !n.trashedAt));

const sortedNotes = computed(() => {
  const toMs = (ts) => ts && typeof ts.toMillis === "function" ? ts.toMillis() : 0;

  const withReminder = activeNotes.value
    .filter(n => n.reminderAt && !n.reminderDone)
    .sort((a, b) => toMs(a.reminderAt) - toMs(b.reminderAt));

  const withoutReminder = activeNotes.value
    .filter(n => !n.reminderAt || n.reminderDone)
    .sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));

  return [...withReminder, ...withoutReminder];
});

const trashedNotes = computed(() => {
  const toMs = (ts) => ts && typeof ts.toMillis === "function" ? ts.toMillis() : 0;
  return notes.value
    .filter(n => !!n.trashedAt)
    .sort((a, b) => toMs(b.trashedAt) - toMs(a.trashedAt));
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
    reminderDismissed: false,
    notificationSent: false,
    items: {},
    itemOrder: [],
    labels: [],
    sharedWith: []
  });
  return docRef.id;
}

async function shareNote(noteId, email) {
  const trimmed = (email || "").trim().toLowerCase();
  if (!trimmed) return;
  try {
    await updateDoc(doc(db, "notes", noteId), {
      sharedWith: arrayUnion(trimmed)
    });
  } catch (err) {
    if (err.code !== "not-found") throw err;
  }
}

async function unshareNote(noteId, email) {
  try {
    await updateDoc(doc(db, "notes", noteId), {
      sharedWith: arrayRemove(email)
    });
  } catch (err) {
    if (err.code !== "not-found") throw err;
  }
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

// Normalize legacy string values ("daily", "weekly") and new object rules
// into a canonical object form, or null for non-recurring.
function parseRecurrence(rec) {
  if (!rec || rec === "none") return null;
  if (rec === "daily") return { type: "days", interval: 1 };
  if (rec === "weekly") return { type: "weeks", interval: 1 };
  if (typeof rec === "object" && rec.type) return rec;
  return null;
}

function isRecurring(rec) {
  return !!parseRecurrence(rec);
}

// Returns the next occurrence of a recurring rule strictly after `reference`.
// `template` carries the time-of-day (and base date for interval math).
function nextOccurrenceAfter(reference, recurrence, template) {
  if (!template) return null;
  const rule = parseRecurrence(recurrence);
  if (!rule) return null;

  const h = template.getHours(), m = template.getMinutes();

  if (rule.type === "days") {
    const n = rule.interval || 1;
    if (n === 1) {
      const next = new Date(reference);
      next.setHours(h, m, 0, 0);
      if (next <= reference) next.setDate(next.getDate() + 1);
      return next;
    }
    const msPerDay = 86400000;
    const tBase = new Date(template); tBase.setHours(h, m, 0, 0);
    const diff = reference.getTime() - tBase.getTime();
    const periods = diff < 0 ? 0 : Math.floor(diff / (n * msPerDay)) + 1;
    const next = new Date(tBase.getTime() + periods * n * msPerDay);
    next.setHours(h, m, 0, 0);
    if (next <= reference) next.setDate(next.getDate() + n);
    return next;
  }

  if (rule.type === "weeks") {
    const n = rule.interval || 1;
    const targetDay = template.getDay();
    const next = new Date(reference);
    next.setHours(h, m, 0, 0);
    const daysAhead = (targetDay - next.getDay() + 7) % 7;
    next.setDate(next.getDate() + daysAhead);
    if (next <= reference) next.setDate(next.getDate() + 7);
    if (n > 1) {
      const tBase = new Date(template); tBase.setHours(h, m, 0, 0);
      while (next > reference) {
        const weeksDiff = Math.round((next.getTime() - tBase.getTime()) / (7 * 86400000));
        if (weeksDiff >= 0 && weeksDiff % n === 0) break;
        next.setDate(next.getDate() + 7);
      }
    }
    return next;
  }

  if (rule.type === "weekdays") {
    const days = rule.days;
    if (!days || !days.length) return null;
    const daysSet = new Set(days);
    const next = new Date(reference);
    next.setHours(h, m, 0, 0);
    if (next <= reference) next.setDate(next.getDate() + 1);
    for (let i = 0; i < 8; i++) {
      if (daysSet.has(next.getDay())) return next;
      next.setDate(next.getDate() + 1);
    }
    return null;
  }

  return null;
}

async function trashNote(noteId) {
  await updateDoc(doc(db, "notes", noteId), {
    trashedAt: serverTimestamp()
  });
}

async function restoreNote(noteId) {
  await updateDoc(doc(db, "notes", noteId), {
    trashedAt: null
  });
}

async function deleteNotePermanently(noteId) {
  await deleteDoc(doc(db, "notes", noteId));
}

async function updateTitle(noteId, title) {
  try {
    await updateDoc(doc(db, "notes", noteId), { title });
  } catch (err) {
    if (err.code !== "not-found") throw err;
  }
}

function normalizeForRecurrence(reminderAt, recurrence) {
  if (!isRecurring(recurrence)) return reminderAt;
  const picked = reminderAt && typeof reminderAt.toDate === "function"
    ? reminderAt.toDate() : null;
  if (!picked) return reminderAt;
  const now = new Date();
  if (picked > now) return reminderAt;
  const next = nextOccurrenceAfter(now, recurrence, picked);
  return next ? Timestamp.fromDate(next) : reminderAt;
}

async function setReminder(noteId, reminderAt, recurrence = null) {
  await updateDoc(doc(db, "notes", noteId), {
    reminderAt: normalizeForRecurrence(reminderAt, recurrence),
    reminderRecurrence: recurrence || "none",
    reminderDone: false,
    reminderDismissed: false,
    notificationSent: false
  });
}

async function dismissReminder(noteId) {
  try {
    await updateDoc(doc(db, "notes", noteId), { reminderDismissed: true });
  } catch (err) {
    if (err.code !== "not-found") throw err;
  }
}

async function clearReminder(noteId) {
  await updateDoc(doc(db, "notes", noteId), {
    reminderAt: null,
    reminderRecurrence: "none",
    reminderDone: false
  });
}

async function markReminderDone(noteId) {
  const note = notes.value.find(n => n.id === noteId);
  const recurrence = note?.reminderRecurrence;
  if (!isRecurring(recurrence)) {
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
    reminderDone: false,
    reminderDismissed: false,
    notificationSent: false
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

async function restoreItem(noteId, itemId, label, checked, position) {
  const note = notes.value.find(n => n.id === noteId);
  const currentOrder = note?.itemOrder ? [...note.itemOrder] : [];
  const insertAt = Math.min(position, currentOrder.length);
  currentOrder.splice(insertAt, 0, itemId);
  await updateDoc(doc(db, "notes", noteId), {
    [`items.${itemId}`]: { label, checked },
    itemOrder: currentOrder
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
    trashedNotes,
    loading,
    accessDenied,
    createNote,
    trashNote,
    restoreNote,
    deleteNotePermanently,
    updateTitle,
    setReminder,
    clearReminder,
    dismissReminder,
    markReminderDone,
    addItem,
    insertItem,
    deleteItem,
    restoreItem,
    setItemChecked,
    setItemLabel,
    setItemOrder,
    addLabel,
    removeLabel,
    shareNote,
    unshareNote,
    newItemId,
    parseRecurrence,
    isRecurring
  };
}
