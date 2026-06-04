import { computed } from "vue";

const URL_RE = /(https?:\/\/[^\s]+)/g;
const TRAILING_PUNCT = /[.,;:!?)\]]+$/;

export default {
  props: {
    text: { type: String, default: "" }
  },
  setup(props) {
    const parts = computed(() => {
      const t = props.text || "";
      const out = [];
      let last = 0;
      let m;
      URL_RE.lastIndex = 0;
      while ((m = URL_RE.exec(t)) !== null) {
        const start = m.index;
        let url = m[0];
        // Don't swallow trailing punctuation into the link.
        let trailing = "";
        const tp = url.match(TRAILING_PUNCT);
        if (tp) {
          trailing = tp[0];
          url = url.slice(0, url.length - trailing.length);
        }
        if (start > last) out.push({ text: t.slice(last, start) });
        out.push({ text: url, href: url });
        if (trailing) out.push({ text: trailing });
        last = start + m[0].length;
      }
      if (last < t.length) out.push({ text: t.slice(last) });
      return out;
    });
    return { parts };
  },
  template: `<span><template v-for="(p, i) in parts" :key="i"><a v-if="p.href" :href="p.href" target="_blank" rel="noopener noreferrer" class="item-link" @click.stop>{{ p.text }}</a><template v-else>{{ p.text }}</template></template></span>`
};
