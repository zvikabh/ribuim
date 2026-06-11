import { ref, computed, onMounted, onUnmounted } from "vue";
import { useNotes } from "../composables/useNotes.js";
import { usePreferences } from "../composables/usePreferences.js";

const ONE_HOUR = 3600_000;
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toDate(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === "function") return ts.toDate();
  if (ts instanceof Date) return ts;
  return null;
}

function formatReminder(date) {
  const now = new Date();
  const day = date.toLocaleDateString([], { weekday: "short" });
  // 24-hour time (Israel), e.g. "17:00".
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

  if (date.toDateString() === now.toDateString()) {
    return `Today (${day}), ${time}`;
  }
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (date.toDateString() === tomorrow.toDateString()) {
    return `Tomorrow (${day}), ${time}`;
  }
  const md = date.toLocaleDateString([], { month: "short", day: "numeric" });
  return `${day}, ${md}, ${time}`;
}

function describeRecurrence(rec) {
  if (!rec || typeof rec !== "object") return "";
  if (rec.type === "days") {
    return rec.interval === 1 ? "Daily" : `Every ${rec.interval} days`;
  }
  if (rec.type === "weeks") {
    return rec.interval === 1 ? "Weekly" : `Every ${rec.interval} weeks`;
  }
  if (rec.type === "weekdays" && rec.days?.length) {
    return rec.days.sort((a, b) => a - b).map(d => DAY_NAMES[d]).join(", ");
  }
  return "";
}

export default {
  props: {
    reminderAt: { type: Object, default: null },
    reminderDone: { type: Boolean, default: false },
    reminderRecurrence: { default: "none" }
  },
  setup(props) {
    const { parseRecurrence, isRecurring: isRecurringFn } = useNotes();
    const { preferences } = usePreferences();

    const DAY_CLASSES = ["day-sun", "day-mon", "day-tue", "day-wed", "day-thu", "day-fri", "day-sat"];

    const now = ref(Date.now());
    let timer = null;
    onMounted(() => { timer = setInterval(() => { now.value = Date.now(); }, 60_000); });
    onUnmounted(() => { if (timer) clearInterval(timer); });

    const date = computed(() => toDate(props.reminderAt));

    const colorClass = computed(() => {
      if (!date.value) return "";
      const mode = preferences.value.reminderColors || "by-time";
      const pastDue = date.value.getTime() < now.value;
      if (mode === "no-colors") return "no-color";
      if (mode === "by-day") {
        // Past-due reminders are bright red (its own shade in this scheme).
        return pastDue ? "day-past" : DAY_CLASSES[date.value.getDay()];
      }
      const diff = date.value.getTime() - now.value;
      if (diff < 0) return "past";
      if (diff < 3 * ONE_HOUR) return "soon3";
      if (diff < 6 * ONE_HOUR) return "soon6";
      return "future";
    });

    const display = computed(() => date.value ? formatReminder(date.value) : "");

    const isRecurring = computed(() => isRecurringFn(props.reminderRecurrence));

    const recLabel = computed(() => {
      const rule = parseRecurrence(props.reminderRecurrence);
      return rule ? describeRecurrence(rule) : "";
    });

    return { date, colorClass, display, isRecurring, recLabel };
  },
  template: `
    <span v-if="date && !reminderDone"
          class="reminder-badge"
          :class="colorClass"
          :title="recLabel">
      <i class="bi" :class="isRecurring ? 'bi-arrow-repeat' : 'bi-bell'"></i>
      <span>{{ display }}</span>
    </span>
  `
};
