import { useAuth } from "../composables/useAuth.js";
import { useView } from "../composables/useView.js";

export default {
  setup() {
    const { currentUser, signOut } = useAuth();
    const { currentViewLabel, toggleSidebar } = useView();
    return { currentUser, signOut, currentViewLabel, toggleSidebar };
  },
  template: `
    <header class="ribuim-header">
      <button class="btn btn-sm btn-light d-md-none ribuim-menu-btn"
              @click="toggleSidebar"
              title="Menu">
        <i class="bi bi-list"></i>
      </button>
      <img src="/ribuim.png" alt="" class="ribuim-logo-icon">
      <div class="ribuim-logo">Ribu<span class="ribuim-logo-accent">im</span></div>
      <div class="ribuim-view-label d-none d-md-inline">{{ currentViewLabel }}</div>
      <div class="ribuim-header-spacer"></div>
      <img v-if="currentUser?.photoURL"
           class="ribuim-user-avatar"
           :src="currentUser.photoURL"
           :alt="currentUser.displayName || currentUser.email"
           referrerpolicy="no-referrer">
      <span class="d-none d-sm-inline" style="font-size:0.9rem;color:#555;">
        {{ currentUser?.displayName || currentUser?.email }}
      </span>
      <button class="btn btn-sm btn-outline-secondary" @click="signOut" title="Sign out">
        <i class="bi bi-box-arrow-right"></i>
        <span class="d-none d-md-inline ms-1">Sign out</span>
      </button>
    </header>
  `
};
