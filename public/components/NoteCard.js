import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from "vue";
import Sortable from "sortablejs";
import { useNotes } from "../composables/useNotes.js";
import { useView } from "../composables/useView.js";
import ChecklistItem from "./ChecklistItem.js";
import ReminderBadge from "./ReminderBadge.js";
import ReminderPicker from "./ReminderPicker.js";
import LabelChips from "./LabelChips.js";
import HighlightText from "./HighlightText.js";

export default {
  components: { ChecklistItem, ReminderBadge, ReminderPicker, LabelChips, HighlightText },
  props: {
    note: { type: Object, required: true }
  },
  setup(props) {
    const {
      notes,
      updateTitle, trashNote, restoreNote, deleteNotePermanently,
      setReminder, clearReminder, markReminderDone,
      insertItem, deleteItem, setItemChecked, setItemLabel, setItemOrder,
      newItemId
    } = useNotes();

    const MAX_VISIBLE = 7;
    const titleInputRef = ref(null);
    const uncheckedListRef = ref(null);
    const itemRefs = ref({});
    const pendingFocusId = ref(null);
    const expanded = ref(false);

    const localTitle = ref(props.note.title || "");
    const titleDirty = ref(false);
    let titleTimer = null;
    let sortable = null;

    watch(() => props.note.title, (newVal) => {
      if (!titleDirty.value) localTitle.value = newVal || "";
    });

    function flushTitle() {
      if (titleTimer) { clearTimeout(titleTimer); titleTimer = null; }
      if (localTitle.value !== (props.note.title || "")) {
        updateTitle(props.note.id, localTitle.value);
      }
      titleDirty.value = false;
    }

    function onTitleInput(e) {
      localTitle.value = e.target.value;
      titleDirty.value = true;
      if (titleTimer) clearTimeout(titleTimer);
      titleTimer = setTimeout(flushTitle, 500);
    }

    async function onTitleKeydown(e) {
      if (e.key !== "Enter") return;
      e.preventDefault();
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
      return out;
    });

    const totalItems = computed(() => uncheckedItems.value.length + checkedItems.value.length);
    const shouldCollapse = computed(() => totalItems.value > MAX_VISIBLE);

    const visibleUnchecked = computed(() => {
      if (!shouldCollapse.value || expanded.value) return uncheckedItems.value;
      return uncheckedItems.value.slice(0, MAX_VISIBLE);
    });

    const visibleChecked = computed(() => {
      if (!shouldCollapse.value || expanded.value) return checkedItems.value;
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

      // After the new component has mounted (and onMounted has fired,
      // focusing the input), clear pendingFocusId so re-renders don't keep
      // marking it as the autofocus target.
      await nextTick();
      pendingFocusId.value = null;
    }

    function onItemToggle(itemId, newChecked) {
      setItemChecked(props.note.id, itemId, newChecked);
    }

    function onItemLabelChange(itemId, newLabel) {
      setItemLabel(props.note.id, itemId, newLabel);
    }

    function onItemDelete(itemId) {
      deleteItem(props.note.id, itemId);
    }

    function onItemEnterPressed(itemId) {
      addNewItem(itemId);
    }

    function onItemBackspaceEmpty(itemId) {
      deleteItem(props.note.id, itemId);
    }

    function onDragEnd() {
      if (!uncheckedListRef.value) return;
      const els = uncheckedListRef.value.querySelectorAll("[data-item-id]");
      const visibleIds = Array.from(els).map(el => el.dataset.itemId);
      const visibleSet = new Set(visibleIds);
      const hiddenIds = uncheckedItems.value
        .filter(i => !visibleSet.has(i.id))
        .map(i => i.id);
      const checkedIds = checkedItems.value.map(i => i.id);
      const fullOrder = [...visibleIds, ...hiddenIds, ...checkedIds];
      setItemOrder(props.note.id, fullOrder);
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
    });

    onBeforeUnmount(() => {
      if (sortable) { sortable.destroy(); sortable = null; }
      if (titleTimer) clearTimeout(titleTimer);
      if (titleDirty.value) flushTitle();
    });

    const { currentView, searchQuery } = useView();
    const isTrashed = computed(() => !!props.note.trashedAt);

    function onTrash() {
      trashNote(props.note.id);
    }

    function onRestore() {
      restoreNote(props.note.id);
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
      localTitle, onTitleInput, onTitleKeydown, flushTitle, isRtl,
      visibleUnchecked, visibleChecked,
      shouldCollapse, expanded, hiddenTotal, collapseLabel, toggleExpanded,
      setItemRef, pendingFocusId,
      onItemToggle, onItemLabelChange, onItemDelete,
      onItemEnterPressed, onItemBackspaceEmpty,
      addNewItem,
      isTrashed, onTrash, onRestore, onDeletePermanently,
      onSetReminder, onClearReminder, onMarkReminderDone,
      hasActiveReminder, searchQuery
    };
  },
  template: `
    <div class="note-card" :dir="isRtl ? 'rtl' : 'ltr'">
      <div v-if="searchQuery && note.title" class="note-title-highlight">
        <HighlightText :text="note.title" :query="searchQuery" />
      </div>
      <input v-else
             ref="titleInputRef"
             class="ribuim-input note-title-input"
             placeholder="Title"
             :value="localTitle"
             @input="onTitleInput"
             @keydown="onTitleKeydown"
             @blur="flushTitle">

      <ReminderBadge :reminder-at="note.reminderAt"
                     :reminder-done="note.reminderDone"
                     :reminder-recurrence="note.reminderRecurrence" />

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
            @backspace-empty="onItemBackspaceEmpty(item.id)" />
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
            @delete="onItemDelete(item.id)" />
        </li>
      </ul>

      <button v-if="shouldCollapse && expanded"
              class="checklist-toggle"
              @click="toggleExpanded">
        <i class="bi bi-chevron-up"></i>
        Show less
      </button>

      <LabelChips :note-id="note.id" :labels="note.labels || []" />

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
        <ReminderPicker :reminder-at="note.reminderAt"
                        :reminder-recurrence="note.reminderRecurrence"
                        :note-title="note.title"
                        @set="onSetReminder"
                        @clear="onClearReminder" />
        <button v-if="hasActiveReminder"
                class="note-action-btn"
                @click="onMarkReminderDone"
                title="Mark reminder done">
          <i class="bi bi-check2"></i>
          <span class="d-none d-sm-inline">Done</span>
        </button>
        <span class="ms-auto"></span>
        <button class="note-action-btn danger"
                @click="onTrash"
                title="Move to trash">
          <i class="bi bi-trash"></i>
        </button>
      </div>
    </div>
  `
};
