import { ref, computed, watch, onBeforeUnmount } from "vue";
import { useNotes } from "../composables/useNotes.js";
import { useView } from "../composables/useView.js";
import NoteCard from "./NoteCard.js";

const MIN_COL_WIDTH = 280;
const COL_GAP = 12;
const GRID_PADDING = 16;

export default {
  components: { NoteCard },
  setup() {
    const { loading, createNote, addLabel } = useNotes();
    const { currentView, currentViewLabel, filteredNotes, setView } = useView();

    const gridRef = ref(null);
    const numCols = ref(1);
    let resizeObserver = null;

    function updateCols() {
      const el = gridRef.value;
      if (!el) return;
      const available = el.clientWidth - GRID_PADDING * 2;
      if (available <= 0) return;
      numCols.value = Math.max(1, Math.floor((available + COL_GAP) / (MIN_COL_WIDTH + COL_GAP)));
    }

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

    async function handleCreate() {
      const view = currentView.value;
      const id = await createNote();
      if (!id) return;
      if (view.type === "label") {
        await addLabel(id, view.value);
      } else if (view.type !== "all") {
        setView({ type: "all" });
      }
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
          <NoteCard v-for="note in col" :key="note.id" :note="note" />
        </div>
      </div>

      <button class="create-note-fab" @click="handleCreate" title="New note">
        <i class="bi bi-plus-lg"></i>
      </button>
    </div>
  `
};
