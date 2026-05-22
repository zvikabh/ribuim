import { ref, watch, onBeforeUnmount, onMounted } from "vue";

export default {
  props: {
    label: { type: String, default: "" },
    checked: { type: Boolean, default: false },
    autofocus: { type: Boolean, default: false }
  },
  emits: ["toggle", "label-change", "delete", "enter-pressed", "backspace-empty"],
  setup(props, { emit }) {
    const inputRef = ref(null);
    const localLabel = ref(props.label);
    const dirty = ref(false);
    let timer = null;

    watch(() => props.label, (newVal) => {
      if (!dirty.value) {
        localLabel.value = newVal;
      }
    });

    function flush() {
      if (timer) { clearTimeout(timer); timer = null; }
      if (localLabel.value !== props.label) {
        emit("label-change", localLabel.value);
      }
      dirty.value = false;
    }

    function onInput(e) {
      localLabel.value = e.target.value;
      dirty.value = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, 500);
    }

    function onBlur() {
      flush();
    }

    function onKeydown(e) {
      if (e.key === "Enter") {
        e.preventDefault();
        flush();
        emit("enter-pressed");
      } else if (e.key === "Backspace" && localLabel.value === "") {
        e.preventDefault();
        emit("backspace-empty");
      }
    }

    function toggle() {
      emit("toggle", !props.checked);
    }

    function focusInput() {
      if (inputRef.value) inputRef.value.focus();
    }

    onMounted(() => {
      if (props.autofocus && inputRef.value) {
        inputRef.value.focus();
      }
    });

    onBeforeUnmount(() => {
      if (timer) clearTimeout(timer);
      if (dirty.value) flush();
    });

    return { inputRef, localLabel, onInput, onBlur, onKeydown, toggle, focusInput };
  },
  template: `
    <span class="checklist-drag-handle" title="Drag to reorder">
      <i class="bi bi-grip-vertical"></i>
    </span>
    <input type="checkbox"
           class="form-check-input checklist-checkbox"
           :checked="checked"
           @change="toggle">
    <input ref="inputRef"
           type="text"
           class="ribuim-input item-label-input"
           :value="localLabel"
           @input="onInput"
           @blur="onBlur"
           @keydown="onKeydown"
           placeholder="">
    <button class="checklist-delete"
            @click="$emit('delete')"
            title="Delete item">
      <i class="bi bi-x-lg"></i>
    </button>
  `
};
