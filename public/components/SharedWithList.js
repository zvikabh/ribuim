import { computed } from "vue";
import { usePreferences } from "../composables/usePreferences.js";

export default {
  props: {
    sharedWith: { type: Array, default: () => [] }
  },
  setup(props) {
    const { getUserByEmail } = usePreferences();
    const users = computed(() =>
      props.sharedWith.map(email => getUserByEmail(email))
    );
    return { users };
  },
  template: `
    <div v-if="users.length" class="shared-with-list">
      <span class="shared-with-label">Shared with:</span>
      <span v-for="u in users" :key="u.email"
            class="shared-with-chip"
            :title="u.email">
        <img v-if="u.photoURL"
             :src="u.photoURL"
             class="shared-with-avatar"
             referrerpolicy="no-referrer">
        <span v-else class="shared-with-avatar shared-with-avatar-placeholder">
          {{ (u.displayName || u.email)[0] }}
        </span>
        <span class="shared-with-name">{{ u.displayName || u.email.split('@')[0] }}</span>
      </span>
    </div>
  `
};
