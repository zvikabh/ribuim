import { useReminders } from "../composables/useReminders.js";

export default {
  setup() {
    const { activeBanners, dismissBanner, dismissAllBanners } = useReminders();
    return { activeBanners, dismissBanner, dismissAllBanners };
  },
  template: `
    <div v-if="activeBanners.length" class="reminder-banner-container">
      <div v-if="activeBanners.length > 1" class="reminder-dismiss-all-banner">
        <i class="bi bi-bell-slash-fill"></i>
        <button class="btn btn-sm btn-outline-secondary"
                @click="dismissAllBanners"
                title="Dismiss all reminders">
          Dismiss all ({{ activeBanners.length }})
        </button>
      </div>
      <div v-for="banner in activeBanners" :key="banner.id" class="reminder-banner">
        <i class="bi bi-bell-fill text-danger"></i>
        <span class="reminder-banner-title">{{ banner.title }}</span>
        <button class="btn btn-sm btn-outline-secondary"
                @click="dismissBanner(banner.id)"
                title="Dismiss">
          Dismiss
        </button>
      </div>
    </div>
  `
};
