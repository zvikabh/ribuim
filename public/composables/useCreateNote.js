import { ref } from "vue";
import { useNotes } from "./useNotes.js";
import { useView } from "./useView.js";
import { useUndo } from "./useUndo.js";

// A request for the grid to scroll to and highlight a note: { id, focus }.
// `focus` puts the cursor in the title (used for freshly created notes). The
// grid clears this after handling it.
const pendingScrollId = ref(null);

export function useCreateNote() {
  const { notes, createNote, duplicateNote, addLabel, trashNote, restoreNote } = useNotes();
  const { currentView, setView } = useView();
  const { pushUndo } = useUndo();

  async function createNoteAction() {
    const view = currentView.value;
    const id = await createNote();
    if (!id) return null;
    if (view.type === "label") {
      await addLabel(id, view.value);
    } else if (view.type !== "all") {
      setView({ type: "all" });
    }
    pushUndo("Created a new note", () => trashNote(id), () => restoreNote(id));
    pendingScrollId.value = { id, focus: true };
    return id;
  }

  async function duplicateNoteAction(noteId) {
    const id = await duplicateNote(noteId);
    if (!id) return null;
    // The copy has no labels/reminder and isn't shared, so it won't appear in a
    // filtered view; switch to All so it's visible to scroll to. Don't steal
    // focus into the title — this isn't a blank note awaiting input.
    if (currentView.value.type !== "all") setView({ type: "all" });
    const srcTitle = notes.value.find(n => n.id === noteId)?.title;
    const srcName = srcTitle ? `"${srcTitle}"` : "an untitled note";
    pushUndo(`Duplicated ${srcName}`, () => trashNote(id), () => restoreNote(id));
    pendingScrollId.value = { id, focus: false };
    return id;
  }

  // Ask the grid to scroll to and highlight an existing note after it moves
  // (e.g. when a reminder is added and it jumps to the reminders region).
  // Defaults to not stealing focus into the title.
  function requestScrollToNote(id, { focus = false } = {}) {
    if (id) pendingScrollId.value = { id, focus };
  }

  return { createNoteAction, duplicateNoteAction, pendingScrollId, requestScrollToNote };
}
