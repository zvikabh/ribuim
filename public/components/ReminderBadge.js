import { ref, computed, onMounted, onUnmounted } from "vue";

const ONE_HOUR = 3600_000;

function toDate(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === "function") return ts.toDate();
  if (ts instanceof Date) return ts;
  return null;
}

function formatReminder(date) {
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (sameDay) return time;
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow " + time;
  return date.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + time;
}

export default {
  props: {
    reminderAt: { type: Object, default: null },
    reminderDone: { type: Boolean, default: false }
  },
  setup(props) {
    const now = ref(Date.now());
    let timer = null;
    onMounted(() => { timer = setInterval(() => { now.value = Date.now(); }, 60_000); });
    onUnmounted(() => { if (timer) clearInterval(timer); });

    const date = computed(() => toDate(props.reminderAt));

    const colorClass = computed(() => {
      if (!date.value) return "";
      const diff = date.value.getTime() - now.value;
      if (diff < 0) return "past";
      if (diff < 3 * ONE_HOUR) return "soon3";
      if (diff < 6 * ONE_HOUR) return "soon6";
      return "future";
    });

    const display = computed(() => date.value ? formatReminder(date.value) : "");

    return { date, colorClass, display };
  },
  template: `
    <span v-if="date && !reminderDone"
          class="reminder-badge"
          :class="colorClass">
      <i class="bi bi-bell"></i>
      <span>{{ display }}</span>
    </span>
  `
};
