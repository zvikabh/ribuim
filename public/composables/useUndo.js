import { ref, computed } from "vue";

const stack = ref([]);
const MAX_STACK = 50;

function pushUndo(description, undoFn) {
  stack.value = [...stack.value, { description, undo: undoFn }];
  if (stack.value.length > MAX_STACK) stack.value = stack.value.slice(-MAX_STACK);
}

const canUndo = computed(() => stack.value.length > 0);

const lastAction = computed(() =>
  stack.value.length ? stack.value[stack.value.length - 1].description : ""
);

async function undo() {
  if (!stack.value.length) return;
  const entry = stack.value[stack.value.length - 1];
  stack.value = stack.value.slice(0, -1);
  try {
    await entry.undo();
  } catch (err) {
    console.warn("Undo failed:", err);
  }
}

function clearStack() {
  stack.value = [];
}

let focusOriginalValue = null;

document.addEventListener("focusin", (e) => {
  const tag = e.target?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") {
    focusOriginalValue = e.target.value;
  }
}, true);

document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
    if (!stack.value.length) return;
    const el = document.activeElement;
    const tag = el?.tagName;
    if ((tag === "INPUT" || tag === "TEXTAREA") && el.value !== focusOriginalValue) {
      return;
    }
    e.preventDefault();
    undo();
  }
});

export function useUndo() {
  return { pushUndo, canUndo, lastAction, undo, clearStack };
}
