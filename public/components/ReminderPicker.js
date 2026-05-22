import { ref, computed, watch } from "vue";
import { Timestamp } from "firebase/firestore";

function pad(n) { return String(n).padStart(2, "0"); }

function toLocalInputValue(date) {
  if (!date) return "";
  return date.getFullYear() + "-"
    + pad(date.getMonth() + 1) + "-"
    + pad(date.getDate()) + "T"
    + pad(date.getHours()) + ":"
    + pad(date.getMinutes());
}

function defaultReminderInputValue() {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return toLocalInputValue(d);
}

export default {
  props: {
    reminderAt: { type: Object, default: null }
  },
  emits: ["set", "clear", "cancel"],
  setup(props, { emit }) {
    const open = ref(false);
    const inputValue = ref("");

    function start() {
      const d = props.reminderAt && typeof props.reminderAt.toDate === "function"
        ? props.reminderAt.toDate()
        : null;
      inputValue.value = d ? toLocalInputValue(d) : defaultReminderInputValue();
      open.value = true;
    }

    function save() {
      if (!inputValue.value) {
        emit("cancel");
      } else {
        const d = new Date(inputValue.value);
        if (!isNaN(d.getTime())) {
          emit("set", Timestamp.fromDate(d));
        }
      }
      open.value = false;
    }

    function clear() {
      emit("clear");
      open.value = false;
    }

    function cancel() {
      emit("cancel");
      open.value = false;
    }

    const hasReminder = computed(() => !!props.reminderAt);

    return { open, inputValue, hasReminder, start, save, clear, cancel };
  },
  template: `
    <span>
      <button v-if="!open"
              class="note-action-btn"
              @click="start"
              :title="hasReminder ? 'Edit reminder' : 'Set reminder'">
        <i class="bi bi-bell"></i>
        <span class="d-none d-sm-inline">{{ hasReminder ? 'Edit reminder' : 'Reminder' }}</span>
      </button>
      <span v-else class="reminder-picker">
        <input type="datetime-local" v-model="inputValue">
        <button class="btn btn-sm btn-primary" @click="save">Save</button>
        <button v-if="hasReminder" class="btn btn-sm btn-outline-danger" @click="clear">Clear</button>
        <button class="btn btn-sm btn-outline-secondary" @click="cancel">Cancel</button>
      </span>
    </span>
  `
};
