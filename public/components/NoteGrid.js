import { useNotes } from "../composables/useNotes.js";
import { useView } from "../composables/useView.js";
import NoteCard from "./NoteCard.js";

export default {
  components: { NoteCard },
  setup() {
    const { loading, createNote, addLabel } = useNotes();
    const { currentView, currentViewLabel, filteredNotes, setView } = useView();

    async function handleCreate() {
      const view = currentView.value;
      const id = await createNote();
      if (!id) return;
      if (view.type === "label") {
        // Auto-tag with the current label; the new note will appear in this
        // view, so we don't switch away.
        await addLabel(id, view.value);
      } else if (view.type !== "all") {
        // Reminders (or other non-"all" views): new note has no reminder, so
        // switch back to All notes so the user can see it.
        setView({ type: "all" });
      }
    }

    return { loading, currentView, currentViewLabel, filteredNotes, handleCreate };
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

      <div v-else class="note-grid">
        <NoteCard v-for="note in filteredNotes" :key="note.id" :note="note" />
      </div>

      <button class="create-note-fab" @click="handleCreate" title="New note">
        <i class="bi bi-plus-lg"></i>
      </button>
    </div>
  `
};
