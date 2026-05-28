import { computed } from "vue";
import { useView } from "../composables/useView.js";
import { useImport } from "../composables/useImport.js";
import { usePreferences } from "../composables/usePreferences.js";

export default {
  setup() {
    const { currentView, sidebarOpen, allLabels, trashCount, searchQuery, setView, closeSidebar } = useView();
    const { showDialog: showImportDialog } = useImport();
    const { showPreferences: showPrefs } = usePreferences();

    function isActive(view) {
      const c = currentView.value;
      if (view.type !== c.type) return false;
      if (view.type === "label") return view.value === c.value;
      return true;
    }

    function openImport() {
      showImportDialog();
      closeSidebar();
    }

    function openPreferences() {
      showPrefs();
      closeSidebar();
    }

    return {
      currentView, sidebarOpen, allLabels, trashCount, searchQuery,
      setView, closeSidebar, isActive, openImport, openPreferences
    };
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

        <button class="ribuim-sidebar-item"
                :class="{ active: isActive({ type: 'shared' }) }"
                @click="setView({ type: 'shared' })">
          <i class="bi bi-people"></i>
          <span>Shared with you</span>
        </button>

        <button class="ribuim-sidebar-item"
                :class="{ active: isActive({ type: 'trash' }) }"
                @click="setView({ type: 'trash' })">
          <i class="bi bi-trash"></i>
          <span>Trash</span>
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

        <div class="ribuim-sidebar-section">Tools</div>
        <div class="ribuim-sidebar-search">
          <i class="bi bi-search"></i>
          <input type="text"
                 class="ribuim-search-input"
                 placeholder="Search"
                 v-model="searchQuery">
        </div>
        <button class="ribuim-sidebar-item" @click="openImport">
          <i class="bi bi-box-arrow-in-down"></i>
          <span>Import from Google Keep</span>
        </button>
        <button class="ribuim-sidebar-item" @click="openPreferences">
          <i class="bi bi-gear"></i>
          <span>Preferences</span>
        </button>
      </nav>
    </aside>

    <div v-if="sidebarOpen"
         class="ribuim-sidebar-backdrop d-md-none"
         @click="closeSidebar"></div>
  `
};
