import { computed } from "vue";
import { useView } from "../composables/useView.js";

export default {
  setup() {
    const { currentView, sidebarOpen, allLabels, setView, closeSidebar } = useView();

    function isActive(view) {
      const c = currentView.value;
      if (view.type !== c.type) return false;
      if (view.type === "label") return view.value === c.value;
      return true;
    }

    return { currentView, sidebarOpen, allLabels, setView, closeSidebar, isActive };
  },
  template: `
    <aside class="ribuim-sidebar" :class="{ open: sidebarOpen }" aria-label="Filters">
      <nav class="ribuim-sidebar-nav">
        <button class="ribuim-sidebar-item"
                :class="{ active: isActive({ type: 'all' }) }"
                @click="setView({ type: 'all' })">
          <i class="bi bi-journal-text"></i>
          <span>All notes</span>
        </button>

        <button class="ribuim-sidebar-item"
                :class="{ active: isActive({ type: 'reminders' }) }"
                @click="setView({ type: 'reminders' })">
          <i class="bi bi-bell"></i>
          <span>Reminders</span>
        </button>

        <template v-if="allLabels.length">
          <div class="ribuim-sidebar-section">Labels</div>
          <button v-for="label in allLabels"
                  :key="label"
                  class="ribuim-sidebar-item"
                  :class="{ active: isActive({ type: 'label', value: label }) }"
                  @click="setView({ type: 'label', value: label })">
            <i class="bi bi-tag"></i>
            <span>{{ label }}</span>
          </button>
        </template>
      </nav>
    </aside>

    <div v-if="sidebarOpen"
         class="ribuim-sidebar-backdrop d-md-none"
         @click="closeSidebar"></div>
  `
};
