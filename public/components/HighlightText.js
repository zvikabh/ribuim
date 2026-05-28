import { computed } from "vue";

export default {
  props: {
    text: { type: String, default: "" },
    query: { type: String, default: "" }
  },
  setup(props) {
    const parts = computed(() => {
      const q = (props.query || "").trim().toLowerCase();
      const t = props.text || "";
      if (!q || !t) return [{ text: t, match: false }];
      const result = [];
      const tLower = t.toLowerCase();
      let pos = 0;
      while (pos < t.length) {
        const idx = tLower.indexOf(q, pos);
        if (idx === -1) {
          result.push({ text: t.slice(pos), match: false });
          break;
        }
        if (idx > pos) result.push({ text: t.slice(pos, idx), match: false });
        result.push({ text: t.slice(idx, idx + q.length), match: true });
        pos = idx + q.length;
      }
      return result;
    });
    return { parts };
  },
  template: `<span><template v-for="(p, i) in parts" :key="i"><mark v-if="p.match" class="search-highlight">{{ p.text }}</mark><template v-else>{{ p.text }}</template></template></span>`
};
