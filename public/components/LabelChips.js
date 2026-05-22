import { ref, nextTick, computed } from "vue";
import { useNotes } from "../composables/useNotes.js";

export default {
  props: {
    noteId: { type: String, required: true },
    labels: { type: Array, default: () => [] }
  },
  setup(props) {
    const { addLabel, removeLabel, notes } = useNotes();

    const editing = ref(false);
    const inputValue = ref("");
    const inputRef = ref(null);

    const allUserLabels = computed(() => {
      const set = new Set();
      for (const note of notes.value) {
        for (const label of note.labels || []) set.add(label);
      }
      return [...set].sort();
    });

    const suggestions = computed(() => {
      const q = inputValue.value.trim().toLowerCase();
      if (!q) return [];
      const taken = new Set(props.labels);
      return allUserLabels.value
        .filter(l => !taken.has(l) && l.toLowerCase().includes(q))
        .slice(0, 6);
    });

    async function startEdit() {
      editing.value = true;
      inputValue.value = "";
      await nextTick();
      if (inputRef.value) inputRef.value.focus();
    }

    async function commit(text) {
      const trimmed = (text ?? inputValue.value).trim();
      if (trimmed && !props.labels.includes(trimmed)) {
        await addLabel(props.noteId, trimmed);
      }
      inputValue.value = "";
      editing.value = false;
    }

    function cancel() {
      inputValue.value = "";
      editing.value = false;
    }

    function onKeydown(e) {
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    }

    function onBlur() {
      // small delay so a click on a suggestion can land first
      setTimeout(() => {
        if (editing.value) commit();
      }, 120);
    }

    function pick(label) {
      commit(label);
    }

    function onRemove(label) {
      removeLabel(props.noteId, label);
    }

    return { editing, inputValue, inputRef, suggestions, startEdit, commit, cancel, onKeydown, onBlur, pick, onRemove };
  },
  template: `
    <div v-if="labels.length || editing" class="note-labels">
      <span v-for="label in labels"
            :key="label"
            class="note-label-chip">
        <span class="note-label-text">#{{ label }}</span>
        <button class="note-label-remove"
                @click="onRemove(label)"
                :title="'Remove ' + label">
          <i class="bi bi-x"></i>
        </button>
      </span>

      <span v-if="editing" class="note-label-input-wrap">
        <input ref="inputRef"
               class="ribuim-input note-label-input"
               type="text"
               v-model="inputValue"
               @keydown="onKeydown"
               @blur="onBlur"
               placeholder="Label name">
        <span v-if="suggestions.length" class="note-label-suggestions">
          <button v-for="s in suggestions"
                  :key="s"
                  type="button"
                  class="note-label-suggestion"
                  @mousedown.prevent="pick(s)">
            #{{ s }}
          </button>
        </span>
      </span>

      <button v-else
              class="note-label-add"
              @click="startEdit">
        <i class="bi bi-plus"></i> Label
      </button>
    </div>

    <button v-else
            class="note-label-add note-label-add-empty"
            @click="startEdit">
      <i class="bi bi-tag"></i>
      <span>Add label</span>
    </button>
  `
};
