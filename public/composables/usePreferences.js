import { ref, watch } from "vue";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase-init.js";
import { useAuth } from "./useAuth.js";

const { currentUser } = useAuth();

const DEFAULTS = {
  reminderColors: "by-time",
  screenUsage: "default"
};

const preferences = ref({ ...DEFAULTS });
const dialogOpen = ref(false);

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
  } catch (err) {
    console.warn("Failed to load preferences:", err);
    preferences.value = { ...DEFAULTS };
  }
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
  } else {
    preferences.value = { ...DEFAULTS };
  }
}, { immediate: true });

export function usePreferences() {
  return { preferences, dialogOpen, showPreferences, closePreferences, updatePreference };
}
