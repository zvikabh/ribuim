import { ref, computed } from "vue";

const undoStack = ref([]);
const redoStack = ref([]);
const MAX_STACK = 50;

// Text edits (item labels) are debounced and continuous, so rather than pushing
// an undo entry per keystroke we buffer them here, keyed by item, and coalesce
// each editing session into a single entry when it's "committed" — i.e. just
// before the next structural action, before an undo, or when the history opens.
// The buffered `before` is the value at the start of the session, so undo
// restores it and redo re-applies the final text. New items and typo fixes on
// existing items go through the same path.
const pendingEdits = new Map();
// Reactive summary of the (non-reactive) buffer, so canUndo/lastAction reflect
// a buffered edit that hasn't been materialized yet (e.g. a lone typo fix).
const pendingDirty = ref(false);
const pendingLastDesc = ref("");

function refreshPending() {
  let real = false;
  for (const e of pendingEdits.values()) { if (e.before !== e.after) { real = true; break; } }
  pendingDirty.value = real;
}

function pushEntry(entry) {
  undoStack.value = [...undoStack.value, entry];
  if (undoStack.value.length > MAX_STACK) undoStack.value = undoStack.value.slice(-MAX_STACK);
}

// Buffer a label edit. `before` is the session-start value (kept across repeated
// edits to the same item); `after`/`description`/`redo` update to the latest.
function recordLabelEdit(key, before, after, undoFn, redoFn, description) {
  if (redoStack.value.length) redoStack.value = []; // a new edit invalidates redo
  const existing = pendingEdits.get(key);
  if (existing) {
    existing.after = after;
    existing.redo = redoFn;
    existing.description = description;
  } else {
    pendingEdits.set(key, { before, after, undo: undoFn, redo: redoFn, description });
  }
  pendingLastDesc.value = description;
  refreshPending();
}

// Materialize buffered edits as undo entries, in edit order, skipping sessions
// that netted back to their original text.
function flushPendingEdits() {
  if (!pendingEdits.size) return;
  const edits = [...pendingEdits.values()];
  pendingEdits.clear();
  pendingDirty.value = false;
  pendingLastDesc.value = "";
  for (const e of edits) {
    if (e.before === e.after) continue;
    pushEntry({ description: e.description, undo: e.undo, redo: e.redo });
  }
}

// Register a user action. `undoFn` reverses it; the optional `redoFn` re-applies
// it (needed for the Redo button/shortcut). A fresh action clears the redo
// history, since redoing across a new branch of edits isn't meaningful.
function pushUndo(description, undoFn, redoFn) {
  flushPendingEdits(); // commit any buffered typing before this structural action
  pushEntry({ description, undo: undoFn, redo: redoFn });
  if (redoStack.value.length) redoStack.value = [];
}

const canUndo = computed(() => undoStack.value.length > 0 || pendingDirty.value);
const canRedo = computed(() => redoStack.value.length > 0);

const lastAction = computed(() => {
  if (pendingDirty.value) return pendingLastDesc.value;
  return undoStack.value.length ? undoStack.value[undoStack.value.length - 1].description : "";
});
const nextRedoAction = computed(() =>
  redoStack.value.length ? redoStack.value[redoStack.value.length - 1].description : ""
);

async function undo() {
  flushPendingEdits(); // so the most recent typing is undoable first
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

// Undo / redo several actions in sequence (for the history dialog).
async function undoMany(count) {
  for (let i = 0; i < count && undoStack.value.length; i++) await undo();
}
async function redoMany(count) {
  for (let i = 0; i < count && redoStack.value.length; i++) await redo();
}

function clearStack() {
  undoStack.value = [];
  redoStack.value = [];
  pendingEdits.clear();
  pendingDirty.value = false;
  pendingLastDesc.value = "";
}

// Descriptions for the history dialog. undoActions is oldest-first (the last
// element is the most recent action); redoActions is oldest-undone-first (the
// last element is the next action that would be redone).
const undoActions = computed(() => undoStack.value.map(e => e.description));
const redoActions = computed(() => redoStack.value.map(e => e.description));

const historyOpen = ref(false);
function openHistory() { flushPendingEdits(); historyOpen.value = true; }
function closeHistory() { historyOpen.value = false; }

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
    flushPendingEdits(); // materialize buffered typing so it can be undone
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
  return {
    pushUndo, recordLabelEdit, canUndo, canRedo, lastAction, nextRedoAction,
    undo, redo, clearStack,
    undoMany, redoMany, undoActions, redoActions, historyOpen, openHistory, closeHistory
  };
}
