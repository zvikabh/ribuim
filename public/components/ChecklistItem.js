import { ref, computed, watch, onBeforeUnmount, onMounted, onUpdated, nextTick } from "vue";
import HighlightText from "./HighlightText.js";
import LinkifiedText from "./LinkifiedText.js";
import { useAutocomplete } from "../composables/useAutocomplete.js";

const URL_RE = /https?:\/\/\S/;

// Measures the vertical pixel offset of the caret (at character `index`)
// within a textarea, using a hidden mirror div that replicates the
// textarea's text layout. Used to tell whether the caret sits on the
// first or last visual line (including soft-wrapped lines).
let caretMirror = null;
const MIRROR_PROPS = [
  "boxSizing", "width", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
  "fontFamily", "fontSize", "fontWeight", "fontStyle", "fontVariant",
  "letterSpacing", "lineHeight", "textTransform", "wordSpacing", "textIndent", "direction"
];
function caretTop(ta, index) {
  const style = getComputedStyle(ta);
  if (!caretMirror) {
    caretMirror = document.createElement("div");
    caretMirror.style.position = "absolute";
    caretMirror.style.visibility = "hidden";
    caretMirror.style.top = "-9999px";
    caretMirror.style.left = "-9999px";
    caretMirror.style.whiteSpace = "pre-wrap";
    caretMirror.style.overflowWrap = "break-word";
    caretMirror.style.wordBreak = "break-word";
    document.body.appendChild(caretMirror);
  }
  const m = caretMirror;
  for (const p of MIRROR_PROPS) m.style[p] = style[p];
  m.textContent = ta.value.slice(0, index);
  const marker = document.createElement("span");
  marker.textContent = ta.value.slice(index) || ".";
  m.appendChild(marker);
  const top = marker.offsetTop;
  m.removeChild(marker);
  return top;
}

export default {
  components: { HighlightText, LinkifiedText },
  props: {
    label: { type: String, default: "" },
    checked: { type: Boolean, default: false },
    autofocus: { type: Boolean, default: false },
    searchQuery: { type: String, default: "" }
  },
  emits: ["toggle", "label-change", "delete", "enter-pressed", "backspace-empty", "navigate"],
  setup(props, { emit }) {
    const { complete } = useAutocomplete();
    const inputRef = ref(null);
    const localLabel = ref(props.label);
    const ghostSuffix = ref("");
    const dirty = ref(false);
    const editing = ref(false);
    let timer = null;

    // Read-only views are shown until the user clicks in to edit:
    //  - search highlight while a search is active,
    //  - linkified view when the item contains a URL.
    // `editing` takes precedence over both so items remain editable.
    const hasUrl = computed(() => URL_RE.test(localLabel.value || ""));
    const showSearchView = computed(() =>
      !!props.searchQuery && !editing.value
    );
    const showLinkView = computed(() =>
      !props.searchQuery && !editing.value && hasUrl.value
    );

    function startEditing() {
      editing.value = true;
      nextTick(() => {
        const el = inputRef.value;
        if (el) {
          el.focus();
          const len = el.value.length;
          el.setSelectionRange(len, len);
          autoResize();
        }
      });
    }

    function updateGhost() {
      const el = inputRef.value;
      if (!el) { ghostSuffix.value = ""; return; }
      const val = el.value;
      const atEnd = el.selectionStart === val.length && el.selectionEnd === val.length;
      ghostSuffix.value = atEnd ? complete(val) : "";
    }

    function acceptGhost() {
      if (!ghostSuffix.value) return false;
      const el = inputRef.value;
      const newVal = (el ? el.value : localLabel.value) + ghostSuffix.value;
      localLabel.value = newVal;
      ghostSuffix.value = "";
      dirty.value = true;
      nextTick(() => {
        if (inputRef.value) {
          inputRef.value.setSelectionRange(newVal.length, newVal.length);
          autoResize();
        }
      });
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, 500);
      return true;
    }

    let lastWidth = 0;
    let resizeObserver = null;

    function autoResize() {
      const el = inputRef.value;
      if (!el) return;
      el.style.height = "0";
      el.style.height = el.scrollHeight + "px";
    }

    function setupResizeObserver() {
      if (resizeObserver) resizeObserver.disconnect();
      const el = inputRef.value;
      if (!el) return;
      resizeObserver = new ResizeObserver(() => {
        const w = el.clientWidth;
        if (w !== lastWidth) {
          lastWidth = w;
          autoResize();
        }
      });
      resizeObserver.observe(el);
    }

    watch(() => props.label, (newVal) => {
      if (!dirty.value) {
        localLabel.value = newVal;
        nextTick(autoResize);
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
      autoResize();
      updateGhost();
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, 500);
    }

    function onBlur() {
      ghostSuffix.value = "";
      editing.value = false;
      flush();
    }

    function atFirstLine() {
      const el = inputRef.value;
      if (!el || el.selectionStart !== el.selectionEnd) return false;
      return caretTop(el, el.selectionStart) <= caretTop(el, 0) + 1;
    }

    function atLastLine() {
      const el = inputRef.value;
      if (!el || el.selectionStart !== el.selectionEnd) return false;
      return caretTop(el, el.selectionStart) >= caretTop(el, el.value.length) - 1;
    }

    function onKeydown(e) {
      if (e.key === "Tab" && ghostSuffix.value) {
        e.preventDefault();
        acceptGhost();
        return;
      }
      if (e.key === "Escape" && ghostSuffix.value) {
        e.preventDefault();
        ghostSuffix.value = "";
        return;
      }
      if (e.key === "ArrowUp" && atFirstLine()) {
        e.preventDefault();
        ghostSuffix.value = "";
        emit("navigate", "up");
        return;
      }
      if (e.key === "ArrowDown" && atLastLine()) {
        e.preventDefault();
        ghostSuffix.value = "";
        emit("navigate", "down");
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        ghostSuffix.value = "";
        flush();
        emit("enter-pressed");
      } else if (e.key === "Enter" && e.shiftKey) {
        ghostSuffix.value = "";
        nextTick(autoResize);
      } else if (e.key === "Backspace" && localLabel.value === "") {
        e.preventDefault();
        emit("backspace-empty");
      }
    }

    function onSelect() {
      updateGhost();
    }

    function toggle() {
      emit("toggle", !props.checked);
    }

    function placeCaret(pos) {
      const el = inputRef.value;
      if (!el) return;
      el.focus();
      const at = pos === "start" ? 0 : el.value.length;
      el.setSelectionRange(at, at);
    }

    function focusInput(pos) {
      // In a read-only view (search highlight or URL link) there's no textarea
      // yet; enter edit mode first so there's one to focus.
      if (!inputRef.value) {
        editing.value = true;
        nextTick(() => placeCaret(pos));
        return;
      }
      placeCaret(pos);
    }

    onMounted(() => {
      autoResize();
      setupResizeObserver();
      if (props.autofocus && inputRef.value) {
        inputRef.value.focus();
      }
    });

    onUpdated(() => {
      if (inputRef.value && !resizeObserver) {
        setupResizeObserver();
      }
    });

    onBeforeUnmount(() => {
      if (resizeObserver) resizeObserver.disconnect();
      if (timer) clearTimeout(timer);
      if (dirty.value) flush();
    });

    return {
      inputRef, localLabel, ghostSuffix, showSearchView, showLinkView,
      onInput, onBlur, onKeydown, onSelect, toggle, focusInput, startEditing
    };
  },
  template: `
    <span class="checklist-drag-handle" title="Drag to reorder">
      <i class="bi bi-grip-vertical"></i>
    </span>
    <input type="checkbox"
           class="form-check-input checklist-checkbox"
           :checked="checked"
           @change="toggle">
    <span v-if="showSearchView" class="item-label-display item-label-linkview" @click="startEditing">
      <HighlightText :text="localLabel" :query="searchQuery" />
    </span>
    <span v-else-if="showLinkView" class="item-label-display item-label-linkview" @click="startEditing">
      <LinkifiedText :text="localLabel" />
    </span>
    <span v-else class="ac-field item-label-field">
      <div v-if="ghostSuffix" class="ac-ghost" aria-hidden="true"><span class="ac-ghost-typed">{{ localLabel }}</span><span class="ac-ghost-suffix">{{ ghostSuffix }}</span></div>
      <textarea ref="inputRef"
                rows="1"
                class="ribuim-input item-label-input"
                :value="localLabel"
                @input="onInput"
                @blur="onBlur"
                @keydown="onKeydown"
                @click="onSelect"
                @keyup="onSelect"
                placeholder=""></textarea>
    </span>
    <button class="checklist-delete"
            @click="$emit('delete')"
            title="Delete item">
      <i class="bi bi-x-lg"></i>
    </button>
  `
};
