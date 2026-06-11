import { useConnectivity } from "../composables/useConnectivity.js";

export default {
  setup() {
    const { showOfflineWarning, minutesSinceSync } = useConnectivity();
    return { showOfflineWarning, minutesSinceSync };
  },
  template: `
    <div v-if="showOfflineWarning" class="offline-banner" role="status">
      <i class="bi bi-wifi-off"></i>
      <span>Offline; last synced {{ minutesSinceSync }} minute{{ minutesSinceSync === 1 ? '' : 's' }} ago</span>
    </div>
  `
};
