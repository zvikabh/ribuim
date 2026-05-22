import { ref, computed } from "vue";
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
    reminderAt: { type: Object, default: null },
    reminderRecurrence: { type: String, default: "none" }
  },
  emits: ["set", "clear", "cancel"],
  setup(props, { emit }) {
    const open = ref(false);
    const inputValue = ref("");
    const recurrenceValue = ref("none");

    function start() {
      const d = props.reminderAt && typeof props.reminderAt.toDate === "function"
        ? props.reminderAt.toDate()
        : null;
      inputValue.value = d ? toLocalInputValue(d) : defaultReminderInputValue();
      recurrenceValue.value = props.reminderRecurrence || "none";
      open.value = true;
    }

    function save() {
      if (!inputValue.value) {
        emit("cancel");
      } else {
        const d = new Date(inputValue.value);
        if (!isNaN(d.getTime())) {
          emit("set", Timestamp.fromDate(d), recurrenceValue.value);
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
    const isRecurring = computed(() =>
      props.reminderRecurrence === "daily" || props.reminderRecurrence === "weekly"
    );

    return {
      open, inputValue, recurrenceValue,
      hasReminder, isRecurring,
      start, save, clear, cancel
    };
  },
  template: `
    <span :class="{ 'reminder-picker-wrap': open }">
      <button v-if="!open"
              class="note-action-btn"
              @click="start"
              :title="hasReminder ? 'Edit reminder' : 'Set reminder'">
        <i class="bi" :class="isRecurring ? 'bi-arrow-repeat' : 'bi-bell'"></i>
        <span class="d-none d-sm-inline">{{ hasReminder ? 'Edit reminder' : 'Reminder' }}</span>
      </button>
      <span v-else class="reminder-picker">
        <input type="datetime-local" v-model="inputValue" class="reminder-picker-input">
        <select v-model="recurrenceValue" class="form-select form-select-sm reminder-picker-select">
          <option value="none">Once</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>
        <span class="reminder-picker-actions">
          <button class="btn btn-sm btn-primary" @click="save">Save</button>
          <button v-if="hasReminder" class="btn btn-sm btn-outline-danger" @click="clear">Clear</button>
          <button class="btn btn-sm btn-outline-secondary" @click="cancel">Cancel</button>
        </span>
      </span>
    </span>
  `
};
