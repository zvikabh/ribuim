import { useReminders } from "../composables/useReminders.js";

export default {
  setup() {
    const { activeBanners, dismissBanner, bannerMarkDone } = useReminders();
    return { activeBanners, dismissBanner, bannerMarkDone };
  },
  template: `
    <div v-if="activeBanners.length" class="reminder-banner-container">
      <div v-for="banner in activeBanners" :key="banner.id" class="reminder-banner">
        <i class="bi bi-bell-fill text-danger"></i>
        <span class="reminder-banner-title">{{ banner.title }}</span>
        <button class="btn btn-sm btn-outline-secondary"
                @click="dismissBanner(banner.id)"
                title="Dismiss">
          Dismiss
        </button>
        <button class="btn btn-sm btn-success"
                @click="bannerMarkDone(banner.id)"
                title="Mark reminder as done">
          Done
        </button>
      </div>
    </div>
  `
};
