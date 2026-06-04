import { ref } from "vue";
import { useNotes } from "./useNotes.js";
import { useView } from "./useView.js";
import { useUndo } from "./useUndo.js";

// Set to the id of a freshly created note so the grid can scroll to,
// highlight, and focus it. The grid clears this after handling it.
const pendingScrollId = ref(null);

export function useCreateNote() {
  const { createNote, addLabel, trashNote } = useNotes();
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
    pushUndo("Create note", () => trashNote(id));
    pendingScrollId.value = id;
    return id;
  }

  return { createNoteAction, pendingScrollId };
}
