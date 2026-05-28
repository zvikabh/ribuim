import { ref, computed, watch, onBeforeUnmount, nextTick } from "vue";
import { useNotes } from "../composables/useNotes.js";
import { useView } from "../composables/useView.js";
import { usePreferences } from "../composables/usePreferences.js";
import NoteCard from "./NoteCard.js";

const MIN_COL_WIDTH = 280;

export default {
  components: { NoteCard },
  setup() {
    const { loading, createNote, addLabel } = useNotes();
    const { currentView, currentViewLabel, filteredNotes, setView } = useView();
    const { preferences } = usePreferences();

    const gridRef = ref(null);
    const numCols = ref(1);
    let resizeObserver = null;

    const gridPadding = computed(() => preferences.value.screenUsage === "cluttered" ? 4 : 16);
    const colGap = computed(() => preferences.value.screenUsage === "cluttered" ? 4 : 12);

    function updateCols() {
      const el = gridRef.value;
      if (!el) return;
      const available = el.clientWidth - gridPadding.value * 2;
      if (available <= 0) return;
      numCols.value = Math.max(1, Math.floor((available + colGap.value) / (MIN_COL_WIDTH + colGap.value)));
    }

    watch([gridPadding, colGap], updateCols);

    watch(gridRef, (el) => {
      if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
      if (el) {
        resizeObserver = new ResizeObserver(updateCols);
        resizeObserver.observe(el);
        updateCols();
      }
    }, { flush: "post" });

    onBeforeUnmount(() => {
      if (resizeObserver) resizeObserver.disconnect();
    });

    // Distribute notes round-robin into columns.
    const columns = computed(() => {
      const n = numCols.value;
      const cols = Array.from({ length: n }, () => []);
      filteredNotes.value.forEach((note, i) => {
        cols[i % n].push(note);
      });
      return cols;
    });

    function scrollToAndHighlight(noteId) {
      const el = gridRef.value?.querySelector(`[data-note-id="${noteId}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      const card = el.querySelector(".note-card") || el;
      card.classList.add("note-card-highlight");
      card.addEventListener("animationend", () => {
        card.classList.remove("note-card-highlight");
      }, { once: true });
    }

    async function handleCreate() {
      const view = currentView.value;
      const id = await createNote();
      if (!id) return;
      if (view.type === "label") {
        await addLabel(id, view.value);
      } else if (view.type !== "all") {
        setView({ type: "all" });
      }
      await nextTick();
      setTimeout(() => scrollToAndHighlight(id), 150);
    }

    return {
      loading, currentView, currentViewLabel, filteredNotes,
      gridRef, columns,
      handleCreate
    };
  },
  template: `
    <div>
      <div v-if="loading && !filteredNotes.length" class="empty-state">
        <i class="bi bi-hourglass-split"></i>
        Loading...
      </div>

      <div v-else-if="!filteredNotes.length && currentView.type === 'all'" class="empty-state">
        <i class="bi bi-journal-text"></i>
        No notes yet. Tap the + button to create one.
      </div>

      <div v-else-if="!filteredNotes.length" class="empty-state">
        <i class="bi bi-search"></i>
        No notes in <strong>{{ currentViewLabel }}</strong>.
      </div>

      <div v-else ref="gridRef" class="note-grid">
        <div v-for="(col, ci) in columns" :key="ci" class="note-grid-col">
          <div v-for="note in col" :key="note.id" :data-note-id="note.id">
            <NoteCard :note="note" />
          </div>
        </div>
      </div>

      <button class="create-note-fab" @click="handleCreate" title="New note">
        <i class="bi bi-plus-lg"></i>
      </button>
    </div>
  `
};
