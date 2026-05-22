import { useNotes } from "../composables/useNotes.js";
import NoteCard from "./NoteCard.js";

export default {
  components: { NoteCard },
  setup() {
    const { sortedNotes, loading, createNote } = useNotes();
    return { sortedNotes, loading, createNote };
  },
  template: `
    <div>
      <div v-if="loading && !sortedNotes.length" class="empty-state">
        <i class="bi bi-hourglass-split"></i>
        Loading...
      </div>

      <div v-else-if="!sortedNotes.length" class="empty-state">
        <i class="bi bi-journal-text"></i>
        No notes yet. Tap the + button to create one.
      </div>

      <div v-else class="note-grid">
        <NoteCard v-for="note in sortedNotes" :key="note.id" :note="note" />
      </div>

      <button class="create-note-fab" @click="createNote" title="New note">
        <i class="bi bi-plus-lg"></i>
      </button>
    </div>
  `
};
