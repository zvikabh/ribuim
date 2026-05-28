import { ref, watch } from "vue";
import { doc, getDoc, setDoc, updateDoc, collection, getDocs } from "firebase/firestore";
import { db } from "../firebase-init.js";
import { useAuth } from "./useAuth.js";

const { currentUser } = useAuth();

const DEFAULTS = {
  reminderColors: "by-time",
  screenUsage: "default"
};

const preferences = ref({ ...DEFAULTS });
const dialogOpen = ref(false);
const allUsers = ref([]);

function showPreferences() { dialogOpen.value = true; }
function closePreferences() { dialogOpen.value = false; }

async function loadPreferences(email) {
  try {
    const snap = await getDoc(doc(db, "userPreferences", email));
    if (snap.exists()) {
      preferences.value = { ...DEFAULTS, ...snap.data() };
    } else {
      preferences.value = { ...DEFAULTS };
      await setDoc(doc(db, "userPreferences", email), { ...DEFAULTS });
    }
    const user = currentUser.value;
    if (user) {
      const profile = {};
      if (user.displayName) profile.displayName = user.displayName;
      if (user.photoURL) profile.photoURL = user.photoURL;
      if (Object.keys(profile).length) {
        await updateDoc(doc(db, "userPreferences", email), profile).catch(() => {});
      }
    }
  } catch (err) {
    console.warn("Failed to load preferences:", err);
    preferences.value = { ...DEFAULTS };
  }
}

async function loadAllUsers() {
  try {
    const snap = await getDocs(collection(db, "userPreferences"));
    allUsers.value = snap.docs.map(d => ({
      email: d.id,
      displayName: d.data().displayName || "",
      photoURL: d.data().photoURL || ""
    }));
  } catch (err) {
    console.warn("Failed to load users:", err);
  }
}

function getUserByEmail(email) {
  return allUsers.value.find(u => u.email === email) || { email, displayName: "", photoURL: "" };
}

async function updatePreference(key, value) {
  preferences.value = { ...preferences.value, [key]: value };
  const email = currentUser.value?.email;
  if (!email) return;
  try {
    await updateDoc(doc(db, "userPreferences", email), { [key]: value });
  } catch (err) {
    if (err.code === "not-found") {
      await setDoc(doc(db, "userPreferences", email), { ...preferences.value });
    } else {
      console.warn("Failed to save preference:", err);
    }
  }
}

watch(currentUser, (user) => {
  if (user?.email) {
    loadPreferences(user.email);
    loadAllUsers();
  } else {
    preferences.value = { ...DEFAULTS };
    allUsers.value = [];
  }
}, { immediate: true });

export function usePreferences() {
  return {
    preferences, dialogOpen, allUsers,
    showPreferences, closePreferences, updatePreference,
    loadAllUsers, getUserByEmail
  };
}
