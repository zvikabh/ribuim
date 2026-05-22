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
  deleteField
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
    reminderDone: false,
    items: {},
    itemOrder: []
  });
  return docRef.id;
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

async function setReminder(noteId, reminderAt) {
  await updateDoc(doc(db, "notes", noteId), {
    reminderAt,
    reminderDone: false
  });
}

async function clearReminder(noteId) {
  await updateDoc(doc(db, "notes", noteId), {
    reminderAt: null,
    reminderDone: false
  });
}

async function markReminderDone(noteId) {
  await updateDoc(doc(db, "notes", noteId), { reminderDone: true });
}

async function addItem(noteId, label = "") {
  const itemId = newItemId();
  await updateDoc(doc(db, "notes", noteId), {
    [`items.${itemId}`]: { label, checked: false },
    itemOrder: arrayUnion(itemId)
  });
  return itemId;
}

async function insertItem(noteId, label, newOrder) {
  const itemId = newItemId();
  await updateDoc(doc(db, "notes", noteId), {
    [`items.${itemId}`]: { label, checked: false },
    itemOrder: newOrder.map(id => id === "__NEW__" ? itemId : id)
  });
  return itemId;
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
    setItemOrder
  };
}
