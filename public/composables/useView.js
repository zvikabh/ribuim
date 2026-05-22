import { ref, computed } from "vue";
import { useNotes } from "./useNotes.js";

const { notes, sortedNotes } = useNotes();

// view is one of: { type: "all" } | { type: "reminders" } | { type: "label", value: string }
const currentView = ref({ type: "all" });
const sidebarOpen = ref(false);

const allLabels = computed(() => {
  const set = new Set();
  for (const note of notes.value) {
    for (const label of note.labels || []) set.add(label);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
});

const filteredNotes = computed(() => {
  const v = currentView.value;
  if (v.type === "reminders") {
    return sortedNotes.value.filter(n => n.reminderAt && !n.reminderDone);
  }
  if (v.type === "label") {
    return sortedNotes.value.filter(n => (n.labels || []).includes(v.value));
  }
  return sortedNotes.value;
});

const currentViewLabel = computed(() => {
  const v = currentView.value;
  if (v.type === "all") return "All notes";
  if (v.type === "reminders") return "Reminders";
  if (v.type === "label") return "#" + v.value;
  return "";
});

function setView(v) {
  currentView.value = v;
  sidebarOpen.value = false;
}

function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value;
}

function closeSidebar() {
  sidebarOpen.value = false;
}

export function useView() {
  return {
    currentView,
    currentViewLabel,
    sidebarOpen,
    allLabels,
    filteredNotes,
    setView,
    toggleSidebar,
    closeSidebar
  };
}
