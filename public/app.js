import { createApp, computed } from "vue";
import "./firebase-init.js";
import { useAuth } from "./composables/useAuth.js";
import { useNotes } from "./composables/useNotes.js";
import { useReminders } from "./composables/useReminders.js";
import LoginScreen from "./components/LoginScreen.js";
import AppHeader from "./components/AppHeader.js";
import NoteGrid from "./components/NoteGrid.js";
import ReminderBanner from "./components/ReminderBanner.js";
import ConfirmDialog from "./components/ConfirmDialog.js";
import Sidebar from "./components/Sidebar.js";
import ImportDialog from "./components/ImportDialog.js";

const App = {
  components: { LoginScreen, AppHeader, NoteGrid, ReminderBanner, ConfirmDialog, Sidebar, ImportDialog },
  setup() {
    const { currentUser, authReady, signOut } = useAuth();
    const { accessDenied } = useNotes();
    const { requestNotificationPermission } = useReminders();

    function onAppClick() {
      if (currentUser.value && !accessDenied.value) {
        requestNotificationPermission();
        document.removeEventListener("click", onAppClick, true);
      }
    }
    document.addEventListener("click", onAppClick, true);

    const stage = computed(() => {
      if (!authReady.value) return "loading";
      if (!currentUser.value) return "login";
      if (accessDenied.value) return "denied";
      return "app";
    });

    return { stage, currentUser, accessDenied, signOut };
  },
  template: `
    <div v-if="stage === 'loading'" class="empty-state">
      <i class="bi bi-hourglass-split"></i>
      Loading...
    </div>

    <LoginScreen v-else-if="stage === 'login'" />

    <div v-else-if="stage === 'denied'">
      <AppHeader />
      <div class="access-denied">
        <h4>Access not approved</h4>
        <p>
          The account <strong>{{ currentUser?.email }}</strong> isn't on the allowlist.
          Ask the admin to add it.
        </p>
        <button class="btn btn-outline-secondary" @click="signOut">Sign out</button>
      </div>
    </div>

    <template v-else>
      <AppHeader />
      <Sidebar />
      <main class="ribuim-main">
        <ReminderBanner />
        <NoteGrid />
      </main>
      <ImportDialog />
    </template>

    <ConfirmDialog />
  `
};

createApp(App).mount("#app");
