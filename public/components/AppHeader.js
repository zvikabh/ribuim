import { useAuth } from "../composables/useAuth.js";

export default {
  setup() {
    const { currentUser, signOut } = useAuth();
    return { currentUser, signOut };
  },
  template: `
    <header class="ribuim-header">
      <div class="ribuim-logo">Ribu<span class="ribuim-logo-accent">im</span></div>
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
