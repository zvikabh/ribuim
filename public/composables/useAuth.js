import { ref } from "vue";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged
} from "firebase/auth";
import { auth } from "../firebase-init.js";

const currentUser = ref(null);
const authReady = ref(false);
const signInError = ref(null);

onAuthStateChanged(auth, (user) => {
  currentUser.value = user;
  authReady.value = true;
});

async function signIn() {
  signInError.value = null;
  try {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  } catch (err) {
    if (err.code === "auth/popup-closed-by-user" ||
        err.code === "auth/cancelled-popup-request") {
      return;
    }
    signInError.value = err.message || String(err);
  }
}

async function signOut() {
  await fbSignOut(auth);
}

export function useAuth() {
  return { currentUser, authReady, signInError, signIn, signOut };
}
