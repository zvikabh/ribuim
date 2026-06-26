import { ref, computed, watch } from "vue";
import { Timestamp } from "firebase/firestore";
import { useNotes } from "../composables/useNotes.js";

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_NAMES_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function pad(n) { return String(n).padStart(2, "0"); }

function toLocalInputValue(date) {
  if (!date) return "";
  return date.getFullYear() + "-"
    + pad(date.getMonth() + 1) + "-"
    + pad(date.getDate()) + "T"
    + pad(date.getHours()) + ":"
    + pad(date.getMinutes());
}

function timeHintFromTitle(title) {
  const t = (title || "").trim();
  if (/בבוקר$/.test(t) || /מוקדם$/.test(t)) return { h: 8, m: 0 };
  if (/אחה[״""]צ$/.test(t) || /אחהצ$/.test(t)) return { h: 17, m: 0 };
  if (/בערב$/.test(t)) return { h: 20, m: 0 };
  if (/בצהריים$/.test(t)) return { h: 12, m: 0 };
  return null;
}

// Hebrew weekday names (ordinal-based). Matched only at the very start of the
// title, as a whole word (not followed by another Hebrew letter).
const WEEKDAY_HINTS = [
  { word: "ראשון", day: 0 },
  { word: "שני", day: 1 },
  { word: "שלישי", day: 2 },
  { word: "רביעי", day: 3 },
  { word: "חמישי", day: 4 },
  { word: "שישי", day: 5 },
  { word: "שבת", day: 6 }
];

function weekdayHintFromTitle(title) {
  const t = (title || "").trim();
  for (const { word, day } of WEEKDAY_HINTS) {
    const re = new RegExp("^" + word + "(?![\\u05D0-\\u05EA])");
    if (re.test(t)) return day;
  }
  return null;
}

function defaultReminderInputValue(title) {
  const time = timeHintFromTitle(title);
  const weekday = weekdayHintFromTitle(title);
  const now = new Date();

  if (weekday !== null) {
    // Next occurrence of the named weekday, at the hinted time (default 8:00).
    const h = time ? time.h : 8;
    const m = time ? time.m : 0;
    const d = new Date(now);
    d.setHours(h, m, 0, 0);
    while (d.getDay() !== weekday || d <= now) {
      d.setDate(d.getDate() + 1);
    }
    return toLocalInputValue(d);
  }

  if (time) {
    const d = new Date(now);
    d.setHours(time.h, time.m, 0, 0);
    if (d <= now) d.setDate(d.getDate() + 1);
    return toLocalInputValue(d);
  }

  const d = new Date(now);
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return toLocalInputValue(d);
}

export default {
  props: {
    reminderAt: { type: Object, default: null },
    reminderRecurrence: { default: "none" },
    noteTitle: { type: String, default: "" }
  },
  emits: ["set", "clear", "cancel"],
  setup(props, { emit }) {
    const { parseRecurrence, isRecurring: isRecurringFn } = useNotes();

    const open = ref(false);
    const inputValue = ref("");
    const recMode = ref("none");
    const recDays = ref([]);
    const recEveryN = ref(1);
    const recEveryUnit = ref("days");

    const pickedDayOfWeek = computed(() => {
      if (!inputValue.value) return 0;
      const d = new Date(inputValue.value);
      return isNaN(d.getTime()) ? 0 : d.getDay();
    });

    const weeklyLabel = computed(() =>
      "Weekly on " + DAY_NAMES_FULL[pickedDayOfWeek.value]
    );

    watch(recMode, (mode) => {
      if (mode === "weekdays") {
        if (!recDays.value.length) {
          recDays.value = [pickedDayOfWeek.value];
        }
      }
    });

    function start() {
      const d = props.reminderAt && typeof props.reminderAt.toDate === "function"
        ? props.reminderAt.toDate() : null;
      inputValue.value = d ? toLocalInputValue(d) : defaultReminderInputValue(props.noteTitle);

      const rule = parseRecurrence(props.reminderRecurrence);
      if (!rule) {
        recMode.value = "none";
      } else if (rule.type === "days" && rule.interval === 1) {
        recMode.value = "daily";
      } else if (rule.type === "weeks" && rule.interval === 1) {
        recMode.value = "weekly";
      } else if (rule.type === "weekdays") {
        recMode.value = "weekdays";
        recDays.value = [...(rule.days || [])];
      } else if (rule.type === "days" || rule.type === "weeks") {
        recMode.value = "every";
        recEveryN.value = rule.interval || 1;
        recEveryUnit.value = rule.type;
      } else {
        recMode.value = "none";
      }
      open.value = true;
    }

    function buildRecurrence() {
      switch (recMode.value) {
        case "none": return null;
        case "daily": return { type: "days", interval: 1 };
        case "weekly": return { type: "weeks", interval: 1 };
        case "weekdays": {
          if (!recDays.value.length) return null;
          return { type: "weekdays", days: [...recDays.value].sort((a, b) => a - b) };
        }
        case "every": {
          return { type: recEveryUnit.value, interval: recEveryN.value || 1 };
        }
      }
      return null;
    }

    function save() {
      if (!inputValue.value) { emit("cancel"); open.value = false; return; }
      const d = new Date(inputValue.value);
      if (isNaN(d.getTime())) { open.value = false; return; }
      emit("set", Timestamp.fromDate(d), buildRecurrence());
      open.value = false;
    }

    function clear() { emit("clear"); open.value = false; }
    function cancel() { emit("cancel"); open.value = false; }

    function toggleDay(day) {
      const idx = recDays.value.indexOf(day);
      if (idx === -1) recDays.value.push(day);
      else recDays.value.splice(idx, 1);
    }

    const hasReminder = computed(() => !!props.reminderAt);
    const isRecurring = computed(() => isRecurringFn(props.reminderRecurrence));

    return {
      open, inputValue, recMode, recDays, recEveryN, recEveryUnit,
      pickedDayOfWeek, weeklyLabel,
      hasReminder, isRecurring,
      start, save, clear, cancel, toggleDay,
      DAY_LABELS
    };
  },
  template: `
    <span :class="{ 'reminder-picker-wrap': open }">
      <button v-if="!open"
              class="note-action-btn"
              @click="start"
              :title="hasReminder ? 'Edit reminder' : 'Set reminder'">
        <i class="bi" :class="isRecurring ? 'bi-arrow-repeat' : 'bi-bell'"></i>
      </button>
      <span v-else class="reminder-picker">
        <input type="datetime-local" v-model="inputValue" class="reminder-picker-input">

        <select v-model="recMode" class="form-select form-select-sm reminder-picker-select">
          <option value="none">Does not repeat</option>
          <option value="daily">Daily</option>
          <option value="weekly">{{ weeklyLabel }}</option>
          <option value="weekdays">Repeat on specific days</option>
          <option value="every">Repeat every</option>
        </select>

        <span v-if="recMode === 'every'" class="rec-interval-row">
          <input type="number" min="1" max="365"
                 v-model.number="recEveryN"
                 class="rec-interval-input">
          <select v-model="recEveryUnit" class="form-select form-select-sm rec-unit-select">
            <option value="days">Days</option>
            <option value="weeks">Weeks</option>
          </select>
        </span>

        <span v-if="recMode === 'weekdays'" class="weekday-picker">
          <button v-for="(label, idx) in DAY_LABELS"
                  :key="idx"
                  type="button"
                  class="weekday-btn"
                  :class="{ active: recDays.includes(idx) }"
                  @click="toggleDay(idx)">
            {{ label }}
          </button>
        </span>

        <span class="reminder-picker-actions">
          <button class="btn btn-sm btn-primary" @click="save">Save</button>
          <button v-if="hasReminder" class="btn btn-sm btn-outline-danger" @click="clear">Clear</button>
          <button class="btn btn-sm btn-outline-secondary" @click="cancel">Cancel</button>
        </span>
      </span>
    </span>
  `
};
