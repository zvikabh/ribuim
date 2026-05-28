import { ref, computed, watch } from "vue";
import { useNotes } from "./useNotes.js";

const { notes, sortedNotes, trashedNotes } = useNotes();

function viewFromHash() {
  const hash = location.hash.replace(/^#\/?/, "");
  if (!hash || hash === "all") return { type: "all" };
  if (hash === "reminders") return { type: "reminders" };
  if (hash === "trash") return { type: "trash" };
  if (hash.startsWith("label/")) {
    const label = decodeURIComponent(hash.slice(6));
    if (label) return { type: "label", value: label };
  }
  return { type: "all" };
}

function hashFromView(v) {
  if (v.type === "reminders") return "#reminders";
  if (v.type === "trash") return "#trash";
  if (v.type === "label") return "#label/" + encodeURIComponent(v.value);
  return "#all";
}

const currentView = ref(viewFromHash());
const sidebarOpen = ref(false);

window.addEventListener("hashchange", () => {
  const v = viewFromHash();
  if (JSON.stringify(v) !== JSON.stringify(currentView.value)) {
    currentView.value = v;
  }
});

const allLabels = computed(() => {
  const set = new Set();
  for (const note of notes.value) {
    if (note.trashedAt) continue;
    for (const label of note.labels || []) set.add(label);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
});

const trashCount = computed(() => trashedNotes.value.length);

const filteredNotes = computed(() => {
  const v = currentView.value;
  if (v.type === "trash") return trashedNotes.value;
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
  if (v.type === "trash") return "Trash";
  if (v.type === "label") return "#" + v.value;
  return "";
});

function setView(v) {
  currentView.value = v;
  sidebarOpen.value = false;
  const newHash = hashFromView(v);
  if (location.hash !== newHash) {
    history.replaceState(null, "", newHash);
  }
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
    trashCount,
    filteredNotes,
    setView,
    toggleSidebar,
    closeSidebar
  };
}
