import { ref, computed, watch, onMounted, onUpdated, onBeforeUnmount, nextTick } from "vue";
import Sortable from "sortablejs";
import { useNotes } from "../composables/useNotes.js";
import { useView } from "../composables/useView.js";
import { useUndo } from "../composables/useUndo.js";
import { useAutocomplete } from "../composables/useAutocomplete.js";
import { usePreferences } from "../composables/usePreferences.js";
import ChecklistItem from "./ChecklistItem.js";
import ReminderBadge from "./ReminderBadge.js";
import ReminderPicker from "./ReminderPicker.js";
import LabelChips from "./LabelChips.js";
import HighlightText from "./HighlightText.js";
import SharedWithList from "./SharedWithList.js";
import { openShareDialog } from "./ShareDialog.js";

export default {
  components: { ChecklistItem, ReminderBadge, ReminderPicker, LabelChips, HighlightText, SharedWithList },
  props: {
    note: { type: Object, required: true }
  },
  setup(props) {
    const {
      notes,
      updateTitle, trashNote, restoreNote, deleteNotePermanently,
      setReminder, clearReminder, markReminderDone,
      insertItem, deleteItem, restoreItem, setItemChecked, setItemsChecked, setItemLabel, setItemOrder,
      newItemId, setPinned
    } = useNotes();
    const { pushUndo } = useUndo();
    const { complete } = useAutocomplete();
    const { preferences } = usePreferences();

    // N = max items before the note collapses (user-configurable, 5-15).
    // When collapsed we show N-4 items, so the smallest "+N more" is +5.
    const collapseThreshold = computed(() => {
      const n = preferences.value.maxVisibleItems || 10;
      return Math.min(15, Math.max(5, n));
    });
    const visibleCount = computed(() => collapseThreshold.value - 4);

    const titleGhost = ref("");
    const titleInputRef = ref(null);
    const uncheckedListRef = ref(null);
    const itemRefs = ref({});
    const pendingFocusId = ref(null);
    const expanded = ref(false);

    const localTitle = ref(props.note.title || "");
    const titleDirty = ref(false);
    let titleTimer = null;
    let sortable = null;
    let titleResizeObserver = null;
    let titleLastWidth = 0;

    // The title is a textarea so long titles wrap; grow it to fit its content.
    function titleAutoResize() {
      const el = titleInputRef.value;
      if (!el) return;
      el.style.height = "0";
      el.style.height = el.scrollHeight + "px";
    }

    watch(() => props.note.title, (newVal) => {
      if (!titleDirty.value) {
        localTitle.value = newVal || "";
        nextTick(titleAutoResize);
      }
    });

    function flushTitle() {
      if (titleTimer) { clearTimeout(titleTimer); titleTimer = null; }
      if (localTitle.value !== (props.note.title || "")) {
        updateTitle(props.note.id, localTitle.value);
      }
      titleDirty.value = false;
    }

    function updateTitleGhost() {
      const el = titleInputRef.value;
      if (!el) { titleGhost.value = ""; return; }
      const val = el.value;
      const atEnd = el.selectionStart === val.length && el.selectionEnd === val.length;
      titleGhost.value = atEnd ? complete(val) : "";
    }

    function acceptTitleGhost() {
      if (!titleGhost.value) return;
      const newVal = localTitle.value + titleGhost.value;
      localTitle.value = newVal;
      titleGhost.value = "";
      titleDirty.value = true;
      nextTick(() => {
        if (titleInputRef.value) {
          titleInputRef.value.setSelectionRange(newVal.length, newVal.length);
          titleAutoResize();
        }
      });
      if (titleTimer) clearTimeout(titleTimer);
      titleTimer = setTimeout(flushTitle, 500);
    }

    function onTitleInput(e) {
      localTitle.value = e.target.value;
      titleDirty.value = true;
      titleAutoResize();
      updateTitleGhost();
      if (titleTimer) clearTimeout(titleTimer);
      titleTimer = setTimeout(flushTitle, 500);
    }

    function onTitleSelect() {
      updateTitleGhost();
    }

    function onTitleBlur() {
      titleGhost.value = "";
      flushTitle();
    }

    async function onTitleKeydown(e) {
      if (e.key === "Tab" && titleGhost.value) {
        e.preventDefault();
        acceptTitleGhost();
        return;
      }
      if (e.key === "Escape" && titleGhost.value) {
        e.preventDefault();
        titleGhost.value = "";
        return;
      }
      if (e.key !== "Enter") return;
      e.preventDefault();
      titleGhost.value = "";
      flushTitle();

      const firstUnchecked = uncheckedItems.value[0];
      if (firstUnchecked) {
        // Insert a new item before the first unchecked item
        const noteId = props.note.id;
        const existingOrder = props.note.itemOrder || [];
        const newId = newItemId();
        const idx = existingOrder.indexOf(firstUnchecked.id);
        const newOrder = [...existingOrder];
        newOrder.splice(idx === -1 ? 0 : idx, 0, newId);

        pendingFocusId.value = newId;

        const noteIdx = notes.value.findIndex(n => n.id === noteId);
        if (noteIdx !== -1) {
          const oldNote = notes.value[noteIdx];
          notes.value[noteIdx] = {
            ...oldNote,
            items: { ...(oldNote.items || {}), [newId]: { label: "", checked: false } },
            itemOrder: newOrder
          };
        }
        insertItem(noteId, "", newOrder, newId).catch(err => {
          if (err && err.code !== "not-found") console.error(err);
        });
      } else {
        await addNewItem();
      }
    }

    const uncheckedItems = computed(() => {
      const order = props.note.itemOrder || [];
      const items = props.note.items || {};
      const out = [];
      for (const id of order) {
        if (items[id] && !items[id].checked) out.push({ id, ...items[id] });
      }
      return out;
    });

    const checkedItems = computed(() => {
      const order = props.note.itemOrder || [];
      const items = props.note.items || {};
      const out = [];
      for (const id of order) {
        if (items[id] && items[id].checked) out.push({ id, ...items[id] });
      }
      // Most-recently-checked items rise to the top. Built in itemOrder
      // first so legacy items without checkedAt keep a stable relative order.
      out.sort((a, b) => (b.checkedAt || 0) - (a.checkedAt || 0));
      return out;
    });

    const totalItems = computed(() => uncheckedItems.value.length + checkedItems.value.length);
    const shouldCollapse = computed(() => totalItems.value > collapseThreshold.value);

    const hasItems = computed(() => totalItems.value > 0);
    const allChecked = computed(() =>
      hasItems.value && uncheckedItems.value.length === 0
    );

    function onCheckAll() {
      const items = props.note.items || {};
      const ids = Object.keys(items);
      if (!ids.length) return;
      const target = !allChecked.value;
      const changed = ids.filter(id => !!items[id].checked !== target);
      if (!changed.length) return;
      const noteId = props.note.id;
      setItemsChecked(noteId, changed, target);
      pushUndo(target ? "Check all items" : "Uncheck all items",
        () => setItemsChecked(noteId, changed, !target));
    }

    const searchForcesExpand = computed(() => {
      const q = searchQuery.value?.trim().toLowerCase();
      if (!q || !shouldCollapse.value) return false;
      for (const item of uncheckedItems.value.slice(visibleCount.value)) {
        if ((item.label || "").toLowerCase().includes(q)) return true;
      }
      for (const item of checkedItems.value) {
        if ((item.label || "").toLowerCase().includes(q)) return true;
      }
      return false;
    });

    const effectiveExpanded = computed(() => expanded.value || searchForcesExpand.value);

    const visibleUnchecked = computed(() => {
      if (!shouldCollapse.value || effectiveExpanded.value) return uncheckedItems.value;
      return uncheckedItems.value.slice(0, visibleCount.value);
    });

    const visibleChecked = computed(() => {
      if (!shouldCollapse.value || effectiveExpanded.value) return checkedItems.value;
      return [];
    });

    const hiddenUnchecked = computed(() => uncheckedItems.value.length - visibleUnchecked.value.length);
    const hiddenChecked = computed(() => checkedItems.value.length - visibleChecked.value.length);
    const hiddenTotal = computed(() => hiddenUnchecked.value + hiddenChecked.value);

    const collapseLabel = computed(() => {
      const hu = hiddenUnchecked.value;
      const hc = hiddenChecked.value;
      const LRM = "\u200e";
      if (hu > 0 && hc > 0) return `${LRM}+ ${hu} unchecked and ${hc} checked items`;
      if (hu > 0) return `${LRM}+ ${hu} more items`;
      if (hc > 0) return `${LRM}+ ${hc} checked items`;
      return "";
    });

    function toggleExpanded() {
      expanded.value = !expanded.value;
    }

    function setItemRef(itemId, instance) {
      if (instance) itemRefs.value[itemId] = instance;
      else delete itemRefs.value[itemId];
    }

    async function addNewItem(afterItemId = null) {
      const noteId = props.note.id;
      const items = props.note.items || {};
      const existingOrder = props.note.itemOrder || [];

      const newId = newItemId();

      let newOrder;
      if (afterItemId) {
        const insertAfter = existingOrder.indexOf(afterItemId);
        if (insertAfter === -1) {
          newOrder = [...existingOrder, newId];
        } else {
          newOrder = [...existingOrder];
          newOrder.splice(insertAfter + 1, 0, newId);
        }
      } else {
        const firstCheckedIdx = existingOrder.findIndex(id => items[id]?.checked);
        if (firstCheckedIdx === -1) {
          newOrder = [...existingOrder, newId];
        } else {
          newOrder = [...existingOrder];
          newOrder.splice(firstCheckedIdx, 0, newId);
        }
      }

      if (shouldCollapse.value && !expanded.value) {
        expanded.value = true;
      }

      // Optimistic local mutation. We can't wait for the Firestore listener
      // round-trip — the user's next keystroke would fire before the listener
      // does, landing in the wrong input. Mutating notes.value directly lets
      // Vue render the new item in this same task, so we can focus it before
      // the next keystroke is processed. When the listener later fires with
      // the same data, it's a no-op overwrite.
      const noteIdx = notes.value.findIndex(n => n.id === noteId);
      if (noteIdx !== -1) {
        const oldNote = notes.value[noteIdx];
        notes.value[noteIdx] = {
          ...oldNote,
          items: { ...(oldNote.items || {}), [newId]: { label: "", checked: false } },
          itemOrder: newOrder
        };
      }

      // Trigger autofocus on the new ChecklistItem when it mounts.
      pendingFocusId.value = newId;

      insertItem(noteId, "", newOrder, newId).catch((err) => {
        if (err && err.code !== "not-found") {
          console.error("insertItem failed:", err);
        }
      });
      pushUndo("Add item", () => deleteItem(noteId, newId));

      // After the new component has mounted (and onMounted has fired,
      // focusing the input), clear pendingFocusId so re-renders don't keep
      // marking it as the autofocus target.
      await nextTick();
      pendingFocusId.value = null;
    }

    function onItemToggle(itemId, newChecked) {
      setItemChecked(props.note.id, itemId, newChecked);
      pushUndo(newChecked ? "Check item" : "Uncheck item",
        () => setItemChecked(props.note.id, itemId, !newChecked));
    }

    function onItemLabelChange(itemId, newLabel) {
      setItemLabel(props.note.id, itemId, newLabel);
    }

    function deleteItemWithUndo(itemId) {
      const item = props.note.items?.[itemId];
      const orderIdx = (props.note.itemOrder || []).indexOf(itemId);
      deleteItem(props.note.id, itemId);
      if (item) {
        const noteId = props.note.id;
        const label = item.label || "";
        const checked = !!item.checked;
        const pos = orderIdx >= 0 ? orderIdx : 0;
        pushUndo("Delete item", () => restoreItem(noteId, itemId, label, checked, pos));
      }
    }

    function onItemDelete(itemId) {
      deleteItemWithUndo(itemId);
    }

    function onItemEnterPressed(itemId) {
      addNewItem(itemId);
    }

    function onItemBackspaceEmpty(itemId) {
      deleteItemWithUndo(itemId);
    }

    // Move focus between items (and to the title) with Up/Down arrows when the
    // caret is at the first/last visual line of an item.
    function onItemNavigate(itemId, direction) {
      const order = [...visibleUnchecked.value, ...visibleChecked.value].map(i => i.id);
      const idx = order.indexOf(itemId);
      if (idx === -1) return;
      if (direction === "up") {
        if (idx === 0) {
          const el = titleInputRef.value;
          if (el) {
            el.focus();
            const n = el.value.length;
            el.setSelectionRange(n, n);
          }
          return;
        }
        focusItem(order[idx - 1], "end");
      } else {
        if (idx >= order.length - 1) return;
        focusItem(order[idx + 1], "start");
      }
    }

    function focusItem(itemId, pos) {
      const ref = itemRefs.value[itemId];
      if (ref && typeof ref.focusInput === "function") ref.focusInput(pos);
    }

    function onDragEnd() {
      if (!uncheckedListRef.value) return;
      const prevOrder = [...(props.note.itemOrder || [])];
      const els = uncheckedListRef.value.querySelectorAll("[data-item-id]");
      const visibleIds = Array.from(els).map(el => el.dataset.itemId);
      const visibleSet = new Set(visibleIds);
      const hiddenIds = uncheckedItems.value
        .filter(i => !visibleSet.has(i.id))
        .map(i => i.id);
      const checkedIds = checkedItems.value.map(i => i.id);
      const fullOrder = [...visibleIds, ...hiddenIds, ...checkedIds];
      const noteId = props.note.id;
      setItemOrder(noteId, fullOrder);
      pushUndo("Reorder items", () => setItemOrder(noteId, prevOrder));
    }

    onMounted(() => {
      if (uncheckedListRef.value) {
        sortable = new Sortable(uncheckedListRef.value, {
          animation: 150,
          handle: ".checklist-drag-handle",
          ghostClass: "sortable-ghost",
          chosenClass: "sortable-chosen",
          dragClass: "sortable-drag",
          onEnd: onDragEnd
        });
      }
      titleAutoResize();
      const titleEl = titleInputRef.value;
      if (titleEl) {
        titleResizeObserver = new ResizeObserver(() => {
          const w = titleEl.clientWidth;
          if (w !== titleLastWidth) { titleLastWidth = w; titleAutoResize(); }
        });
        titleResizeObserver.observe(titleEl);
      }
    });

    // The title textarea isn't rendered in search mode; set up its observer
    // (and size it) once it appears.
    onUpdated(() => {
      const titleEl = titleInputRef.value;
      if (titleEl && !titleResizeObserver) {
        titleAutoResize();
        titleResizeObserver = new ResizeObserver(() => {
          const w = titleEl.clientWidth;
          if (w !== titleLastWidth) { titleLastWidth = w; titleAutoResize(); }
        });
        titleResizeObserver.observe(titleEl);
      }
    });

    onBeforeUnmount(() => {
      if (sortable) { sortable.destroy(); sortable = null; }
      if (titleResizeObserver) { titleResizeObserver.disconnect(); titleResizeObserver = null; }
      if (titleTimer) clearTimeout(titleTimer);
      if (titleDirty.value) flushTitle();
    });

    const { currentView, searchQuery } = useView();
    const isTrashed = computed(() => !!props.note.trashedAt);
    const isOwner = computed(() => props.note._isOwner !== false);

    function onShare() {
      openShareDialog(props.note);
    }

    function onTogglePin() {
      const noteId = props.note.id;
      const target = !props.note.pinned;
      setPinned(noteId, target);
      pushUndo(target ? "Pin note" : "Unpin note",
        () => setPinned(noteId, !target));
    }

    function onTrash() {
      const noteId = props.note.id;
      trashNote(noteId);
      pushUndo("Move to trash", () => restoreNote(noteId));
    }

    function onRestore() {
      const noteId = props.note.id;
      restoreNote(noteId);
      pushUndo("Restore note", () => trashNote(noteId));
    }

    function onDeletePermanently() {
      deleteNotePermanently(props.note.id);
    }

    function onSetReminder(timestamp, recurrence) {
      setReminder(props.note.id, timestamp, recurrence || "none");
    }

    function onClearReminder() {
      clearReminder(props.note.id);
    }

    function onMarkReminderDone() {
      markReminderDone(props.note.id);
    }

    const hasActiveReminder = computed(() =>
      props.note.reminderAt && !props.note.reminderDone
    );

    const isRtl = computed(() => {
      const t = props.note.title || "";
      const rtlChars = t.match(/[֐-׿؀-ۿ܀-ݏ]/g);
      const latinChars = t.match(/[A-Za-z]/g);
      return (rtlChars?.length || 0) > (latinChars?.length || 0);
    });

    return {
      titleInputRef, uncheckedListRef,
      localTitle, titleGhost, onTitleInput, onTitleKeydown, onTitleSelect, onTitleBlur, flushTitle, isRtl,
      visibleUnchecked, visibleChecked,
      shouldCollapse, expanded, hiddenTotal, collapseLabel, toggleExpanded,
      setItemRef, pendingFocusId,
      onItemToggle, onItemLabelChange, onItemDelete,
      onItemEnterPressed, onItemBackspaceEmpty, onItemNavigate,
      addNewItem,
      hasItems, allChecked, onCheckAll,
      isTrashed, isOwner, onTrash, onRestore, onDeletePermanently, onTogglePin,
      onSetReminder, onClearReminder, onMarkReminderDone,
      hasActiveReminder, searchQuery, onShare
    };
  },
  template: `
    <div class="note-card" :dir="isRtl ? 'rtl' : 'ltr'">
      <button v-if="isOwner && !isTrashed"
              class="note-pin"
              :class="{ pinned: note.pinned }"
              @click="onTogglePin"
              :title="note.pinned ? 'Unpin' : 'Pin'">
        <i class="bi" :class="note.pinned ? 'bi-pin-angle-fill' : 'bi-pin-angle'"></i>
      </button>
      <div v-if="searchQuery && note.title" class="note-title-highlight">
        <HighlightText :text="note.title" :query="searchQuery" />
      </div>
      <span v-else class="ac-field note-title-field">
        <div v-if="titleGhost" class="ac-ghost" aria-hidden="true"><span class="ac-ghost-typed">{{ localTitle }}</span><span class="ac-ghost-suffix">{{ titleGhost }}</span></div>
        <textarea ref="titleInputRef"
               rows="1"
               class="ribuim-input note-title-input"
               placeholder="Title"
               :value="localTitle"
               @input="onTitleInput"
               @keydown="onTitleKeydown"
               @click="onTitleSelect"
               @keyup="onTitleSelect"
               @blur="onTitleBlur"></textarea>
      </span>

      <ReminderBadge v-if="isOwner"
                     :reminder-at="note.reminderAt"
                     :reminder-done="note.reminderDone"
                     :reminder-recurrence="note.reminderRecurrence" />

      <button v-if="shouldCollapse && expanded"
              class="checklist-toggle"
              @click="toggleExpanded">
        <i class="bi bi-chevron-up"></i>
        Show less
      </button>

      <ul ref="uncheckedListRef" class="checklist">
        <li v-for="item in visibleUnchecked"
            :key="item.id"
            :data-item-id="item.id"
            class="checklist-item">
          <ChecklistItem
            :ref="(el) => setItemRef(item.id, el)"
            :label="item.label"
            :checked="false"
            :autofocus="item.id === pendingFocusId"
            :search-query="searchQuery"
            @toggle="(c) => onItemToggle(item.id, c)"
            @label-change="(l) => onItemLabelChange(item.id, l)"
            @delete="onItemDelete(item.id)"
            @enter-pressed="onItemEnterPressed(item.id)"
            @backspace-empty="onItemBackspaceEmpty(item.id)"
            @navigate="(dir) => onItemNavigate(item.id, dir)" />
        </li>
      </ul>

      <button v-if="shouldCollapse && !expanded && hiddenTotal > 0"
              class="checklist-toggle"
              @click="toggleExpanded">
        <i class="bi bi-chevron-down"></i>
        {{ collapseLabel }}
      </button>

      <button class="add-item-row note-action-btn" @click="() => addNewItem()">
        <i class="bi bi-plus-lg add-item-icon"></i>
        <span>List item</span>
      </button>

      <ul v-if="visibleChecked.length" class="checklist checklist-done">
        <li v-for="item in visibleChecked"
            :key="item.id"
            :data-item-id="item.id"
            class="checklist-item is-checked">
          <ChecklistItem
            :ref="(el) => setItemRef(item.id, el)"
            :label="item.label"
            :checked="true"
            :search-query="searchQuery"
            @toggle="(c) => onItemToggle(item.id, c)"
            @label-change="(l) => onItemLabelChange(item.id, l)"
            @delete="onItemDelete(item.id)"
            @navigate="(dir) => onItemNavigate(item.id, dir)" />
        </li>
      </ul>

      <button v-if="shouldCollapse && expanded"
              class="checklist-toggle"
              @click="toggleExpanded">
        <i class="bi bi-chevron-up"></i>
        Show less
      </button>

      <LabelChips v-if="isOwner" :note-id="note.id" :labels="note.labels || []" />

      <SharedWithList v-if="isOwner" :shared-with="note.sharedWith || []" />

      <div v-if="isTrashed" class="note-actions" dir="ltr">
        <button class="note-action-btn"
                @click="onRestore"
                title="Restore note">
          <i class="bi bi-arrow-counterclockwise"></i>
          <span>Restore</span>
        </button>
        <span class="ms-auto"></span>
        <button class="note-action-btn danger"
                @click="onDeletePermanently"
                title="Delete permanently">
          <i class="bi bi-x-circle"></i>
          <span>Delete forever</span>
        </button>
      </div>
      <div v-else class="note-actions" dir="ltr">
        <button v-if="hasItems"
                class="note-action-btn"
                @click="onCheckAll"
                :title="allChecked ? 'Uncheck all items' : 'Check all items'">
          <i class="bi" :class="allChecked ? 'bi-square' : 'bi-check2-all'"></i>
          <span class="d-none d-sm-inline">{{ allChecked ? 'Uncheck all' : 'Check all' }}</span>
        </button>
        <ReminderPicker v-if="isOwner"
                        :reminder-at="note.reminderAt"
                        :reminder-recurrence="note.reminderRecurrence"
                        :note-title="note.title"
                        @set="onSetReminder"
                        @clear="onClearReminder" />
        <button v-if="isOwner && hasActiveReminder"
                class="note-action-btn"
                @click="onMarkReminderDone"
                title="Mark reminder done">
          <i class="bi bi-check2"></i>
          <span class="d-none d-sm-inline">Done</span>
        </button>
        <button v-if="isOwner"
                class="note-action-btn"
                @click="onShare"
                title="Share note">
          <i class="bi bi-people"></i>
          <span class="d-none d-sm-inline">Share</span>
        </button>
        <span class="ms-auto"></span>
        <button v-if="isOwner"
                class="note-action-btn danger"
                @click="onTrash"
                title="Move to trash">
          <i class="bi bi-trash"></i>
        </button>
      </div>
    </div>
  `
};
