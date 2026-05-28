import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from "firebase/firestore";

// Replace the placeholder values below with your Firebase project config.
// Find this in: Firebase Console -> Project Settings -> General -> Your apps -> Web app
export const firebaseConfig = {
  apiKey: "AIzaSyDD7xkobHBI0eoty6XuWCoJ-R4-mfa9S4M",
  authDomain: "ribuim.firebaseapp.com",
  projectId: "ribuim",
  storageBucket: "ribuim.firebasestorage.app",
  messagingSenderId: "141305632469",
  appId: "1:141305632469:web:09a2af3d3d2a645312f45c"
};

// For push notifications (Tier 2): generate a VAPID key in
// Firebase Console -> Project Settings -> Cloud Messaging -> Web Push certificates
// Leave as empty string to disable push notification registration.
export const vapidKey = "BIYhG2az5I2WbJcZ0FRRVuKEgnDPNrBV7w6jKa_F97IeMcMgpcRnbL6LVk649A4n_oUmC1rcOpCCs96fsodEwaQ";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});
