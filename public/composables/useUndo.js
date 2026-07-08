import { ref, computed } from "vue";

const undoStack = ref([]);
const redoStack = ref([]);
const MAX_STACK = 50;

// Register a user action. `undoFn` reverses it; the optional `redoFn` re-applies
// it (needed for the Redo button/shortcut). A fresh action clears the redo
// history, since redoing across a new branch of edits isn't meaningful.
function pushUndo(description, undoFn, redoFn) {
  undoStack.value = [...undoStack.value, { description, undo: undoFn, redo: redoFn }];
  if (undoStack.value.length > MAX_STACK) undoStack.value = undoStack.value.slice(-MAX_STACK);
  if (redoStack.value.length) redoStack.value = [];
}

const canUndo = computed(() => undoStack.value.length > 0);
const canRedo = computed(() => redoStack.value.length > 0);

const lastAction = computed(() =>
  undoStack.value.length ? undoStack.value[undoStack.value.length - 1].description : ""
);
const nextRedoAction = computed(() =>
  redoStack.value.length ? redoStack.value[redoStack.value.length - 1].description : ""
);

async function undo() {
  if (!undoStack.value.length) return;
  const entry = undoStack.value[undoStack.value.length - 1];
  undoStack.value = undoStack.value.slice(0, -1);
  try {
    await entry.undo();
    redoStack.value = [...redoStack.value, entry];
  } catch (err) {
    console.warn("Undo failed:", err);
  }
}

async function redo() {
  if (!redoStack.value.length) return;
  const entry = redoStack.value[redoStack.value.length - 1];
  redoStack.value = redoStack.value.slice(0, -1);
  try {
    if (entry.redo) await entry.redo();
    undoStack.value = [...undoStack.value, entry];
  } catch (err) {
    console.warn("Redo failed:", err);
  }
}

function clearStack() {
  undoStack.value = [];
  redoStack.value = [];
}

let focusOriginalValue = null;

document.addEventListener("focusin", (e) => {
  const tag = e.target?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") {
    focusOriginalValue = e.target.value;
  }
}, true);

document.addEventListener("keydown", (e) => {
  if (!(e.metaKey || e.ctrlKey)) return;
  const isUndo = e.key === "z" && !e.shiftKey;
  const isRedo = (e.key === "z" && e.shiftKey) || e.key === "y";
  if (!isUndo && !isRedo) return;
  // While editing a text field whose value has changed, leave Ctrl+Z/Ctrl+Y to
  // the browser's native text undo/redo.
  const el = document.activeElement;
  const tag = el?.tagName;
  if ((tag === "INPUT" || tag === "TEXTAREA") && el.value !== focusOriginalValue) {
    return;
  }
  if (isUndo) {
    if (!undoStack.value.length) return;
    e.preventDefault();
    undo();
  } else {
    if (!redoStack.value.length) return;
    e.preventDefault();
    redo();
  }
});

export function useUndo() {
  return { pushUndo, canUndo, canRedo, lastAction, nextRedoAction, undo, redo, clearStack };
}
