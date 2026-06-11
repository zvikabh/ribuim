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
import { useConnectivity } from "./useConnectivity.js";

const { currentUser } = useAuth();
const { markSynced } = useConnectivity();

const notes = ref([]);
const loading = ref(false);
const accessDenied = ref(false);

let unsubOwned = null;
let unsubShared = null;
let listenerGen = 0;
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
  const gen = ++listenerGen;
  let ownedReady = false, sharedReady = false;

  function markReady(isOwned) {
    if (isOwned) ownedReady = true; else sharedReady = true;
    if (ownedReady && sharedReady) loading.value = false;
  }

  // Subscribe to a query and automatically re-subscribe (with exponential
  // backoff) if the stream hits a terminal error. Transient network drops are
  // already handled internally by the SDK and don't reach the error callback;
  // this guards the rarer terminal errors (token expiry, backend closing the
  // stream, etc.) that would otherwise silently stop this device from syncing
  // until a full page reload. Returns a cleanup function.
  function subscribe(q, map, isOwned) {
    let backoff = 1000;
    let retryTimer = null;
    let unsub = null;

    function attach() {
      let fresh = true;
      unsub = onSnapshot(q,
        (snapshot) => {
          if (gen !== listenerGen) return;
          backoff = 1000; // a successful snapshot resets the backoff
          if (!snapshot.metadata.fromCache) markSynced();
          if (fresh) {
            // A fresh (re-)subscription's first snapshot is the authoritative
            // full result set. Rebuild the map from it so any docs deleted
            // while we were detached are dropped (incremental docChanges from
            // a new listener never report those removals).
            map.clear();
            snapshot.forEach((d) => map.set(d.id, d.data()));
            fresh = false;
            mergeNotes(email);
          } else {
            applyDocChanges(map, snapshot, email);
          }
          markReady(isOwned);
        },
        (error) => {
          if (gen !== listenerGen) return;
          if (error.code === "permission-denied") {
            // Genuine access loss — not retryable.
            if (isOwned) accessDenied.value = true;
            markReady(isOwned);
            return;
          }
          console.warn("Notes listener error, will retry:", error);
          markReady(isOwned); // don't leave the UI stuck on "Loading…"
          if (retryTimer) clearTimeout(retryTimer);
          retryTimer = setTimeout(() => {
            if (gen !== listenerGen) return;
            attach();
          }, backoff);
          backoff = Math.min(backoff * 2, 30000);
        }
      );
    }

    attach();

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      if (unsub) unsub();
    };
  }

  const q1 = query(collection(db, "notes"), where("ownerEmail", "==", email));
  unsubOwned = subscribe(q1, ownedNotes, true);

  const q2 = query(collection(db, "notes"), where("sharedWith", "array-contains", email));
  unsubShared = subscribe(q2, sharedNotes, false);
}

function stopListener() {
  // Invalidate any in-flight retry/callback from the previous subscription.
  listenerGen++;
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
  // Non-reminder notes sort by "effective" date: doneAt if the note's reminder
  // was just marked Done (so it surfaces at the top), else its creation time.
  const effective = (n) => toMs(n.doneAt) || toMs(n.createdAt);

  const withReminder = activeNotes.value
    .filter(n => n.reminderAt && !n.reminderDone)
    .sort((a, b) => toMs(a.reminderAt) - toMs(b.reminderAt));

  const withoutReminder = activeNotes.value
    .filter(n => !n.reminderAt || n.reminderDone)
    .sort((a, b) => effective(b) - effective(a));

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

// Pinning is per-user: pinnedBy holds the emails of users who pinned the note.
// For backwards compatibility, a note that predates this (no pinnedBy field)
// falls back to the old global `pinned` boolean, which only ever reflected the
// creator's pin (pinning used to be owner-only).
function isPinnedForMe(note) {
  const email = currentUser.value?.email;
  if (!email) return false;
  if (Array.isArray(note.pinnedBy) && note.pinnedBy.includes(email)) return true;
  // Legacy fallback: the old global `pinned` flag was the creator's pin.
  return note.pinned === true && note.ownerEmail === email;
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
    sharedWith: [],
    pinnedBy: []
  });
  return docRef.id;
}

// Pin/unpin the note for the current user only (adds/removes their email from
// pinnedBy). Creating pinnedBy on first write means the legacy global `pinned`
// flag is thereafter ignored for that note (see isPinnedForMe).
async function setPinned(noteId, pinned) {
  const email = currentUser.value?.email;
  if (!email) return;
  const note = notes.value.find(n => n.id === noteId);
  const update = {
    pinnedBy: pinned ? arrayUnion(email) : arrayRemove(email)
  };
  // If the creator is unpinning a legacy note, also clear the old global flag
  // (which the read still honors for the creator) so it actually unpins.
  if (!pinned && note && note.pinned === true && note.ownerEmail === email) {
    update.pinned = false;
  }
  try {
    await updateDoc(doc(db, "notes", noteId), update);
  } catch (err) {
    if (err.code !== "not-found") throw err;
  }
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
    // No longer a reminder: stamp doneAt so it sorts to the top of the
    // non-reminder area (createdAt is immutable, so we can't change that).
    await updateDoc(doc(db, "notes", noteId), {
      reminderDone: true,
      doneAt: Timestamp.now()
    });
    return;
  }
  const template = note?.reminderAt && typeof note.reminderAt.toDate === "function"
    ? note.reminderAt.toDate() : null;
  const now = new Date();
  const reference = template && template.getTime() > now.getTime() ? template : now;
  const next = nextOccurrenceAfter(reference, recurrence, template);
  if (!next) {
    await updateDoc(doc(db, "notes", noteId), {
      reminderDone: true,
      doneAt: Timestamp.now()
    });
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
  const update = { [`items.${itemId}.checked`]: checked };
  // Record when the item was checked so the checked list can order
  // most-recently-checked items at the bottom. itemOrder is left
  // untouched, so unchecking returns the item to its original position.
  if (checked) update[`items.${itemId}.checkedAt`] = Date.now();
  await updateDoc(doc(db, "notes", noteId), update);
}

// Set the checked state of several items in one write (e.g. "check all").
async function setItemsChecked(noteId, itemIds, checked) {
  if (!itemIds || !itemIds.length) return;
  const update = {};
  const now = Date.now();
  for (const itemId of itemIds) {
    update[`items.${itemId}.checked`] = checked;
    if (checked) update[`items.${itemId}.checkedAt`] = now;
  }
  await updateDoc(doc(db, "notes", noteId), update);
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
    setItemsChecked,
    setItemLabel,
    setItemOrder,
    addLabel,
    removeLabel,
    shareNote,
    unshareNote,
    setPinned,
    isPinnedForMe,
    newItemId,
    parseRecurrence,
    isRecurring
  };
}
