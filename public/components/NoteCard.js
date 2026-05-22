import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from "vue";
import Sortable from "sortablejs";
import { useNotes } from "../composables/useNotes.js";
import ChecklistItem from "./ChecklistItem.js";
import ReminderBadge from "./ReminderBadge.js";
import ReminderPicker from "./ReminderPicker.js";

export default {
  components: { ChecklistItem, ReminderBadge, ReminderPicker },
  props: {
    note: { type: Object, required: true }
  },
  setup(props) {
    const {
      updateTitle, deleteNote: deleteNoteFn,
      setReminder, clearReminder, markReminderDone,
      insertItem, deleteItem, setItemChecked, setItemLabel, setItemOrder
    } = useNotes();

    const titleInputRef = ref(null);
    const uncheckedListRef = ref(null);
    const itemRefs = ref({});

    const localTitle = ref(props.note.title || "");
    const titleDirty = ref(false);
    let titleTimer = null;
    let sortable = null;
    let pendingFocusId = null;

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

    function setItemRef(itemId, instance) {
      if (instance) itemRefs.value[itemId] = instance;
      else delete itemRefs.value[itemId];
    }

    watch(uncheckedItems, async () => {
      if (pendingFocusId) {
        await nextTick();
        const ref = itemRefs.value[pendingFocusId];
        if (ref && typeof ref.focusInput === "function") {
          ref.focusInput();
        }
        pendingFocusId = null;
      }
    });

    async function addNewItem(afterItemId = null) {
      const noteId = props.note.id;
      const items = props.note.items || {};
      const existingOrder = props.note.itemOrder || [];
      const PLACEHOLDER = "__NEW__";

      let newOrder;
      if (afterItemId) {
        const insertAfter = existingOrder.indexOf(afterItemId);
        if (insertAfter === -1) {
          newOrder = [...existingOrder, PLACEHOLDER];
        } else {
          newOrder = [...existingOrder];
          newOrder.splice(insertAfter + 1, 0, PLACEHOLDER);
        }
      } else {
        const firstCheckedIdx = existingOrder.findIndex(id => items[id]?.checked);
        if (firstCheckedIdx === -1) {
          newOrder = [...existingOrder, PLACEHOLDER];
        } else {
          newOrder = [...existingOrder];
          newOrder.splice(firstCheckedIdx, 0, PLACEHOLDER);
        }
      }

      const newId = await insertItem(noteId, "", newOrder);
      pendingFocusId = newId;
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
      const newUncheckedOrder = Array.from(els).map(el => el.dataset.itemId);
      const checkedIds = checkedItems.value.map(i => i.id);
      const fullOrder = [...newUncheckedOrder, ...checkedIds];
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

    function confirmDeleteNote() {
      const label = props.note.title?.trim() || "this note";
      if (confirm(`Delete "${label}"?`)) {
        deleteNoteFn(props.note.id);
      }
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

    return {
      titleInputRef, uncheckedListRef,
      localTitle, onTitleInput, flushTitle,
      uncheckedItems, checkedItems,
      setItemRef,
      onItemToggle, onItemLabelChange, onItemDelete,
      onItemEnterPressed, onItemBackspaceEmpty,
      addNewItem,
      confirmDeleteNote,
      onSetReminder, onClearReminder, onMarkReminderDone,
      hasActiveReminder
    };
  },
  template: `
    <div class="note-card">
      <input ref="titleInputRef"
             class="ribuim-input note-title-input"
             placeholder="Title"
             :value="localTitle"
             @input="onTitleInput"
             @blur="flushTitle">

      <ReminderBadge :reminder-at="note.reminderAt"
                     :reminder-done="note.reminderDone"
                     :reminder-recurrence="note.reminderRecurrence" />

      <ul ref="uncheckedListRef" class="checklist">
        <li v-for="item in uncheckedItems"
            :key="item.id"
            :data-item-id="item.id"
            class="checklist-item">
          <ChecklistItem
            :ref="(el) => setItemRef(item.id, el)"
            :label="item.label"
            :checked="false"
            @toggle="(c) => onItemToggle(item.id, c)"
            @label-change="(l) => onItemLabelChange(item.id, l)"
            @delete="onItemDelete(item.id)"
            @enter-pressed="onItemEnterPressed(item.id)"
            @backspace-empty="onItemBackspaceEmpty(item.id)" />
        </li>
      </ul>

      <button class="add-item-row note-action-btn" @click="() => addNewItem()">
        <i class="bi bi-plus-lg add-item-icon"></i>
        <span>List item</span>
      </button>

      <ul v-if="checkedItems.length" class="checklist checklist-done">
        <li v-for="item in checkedItems"
            :key="item.id"
            :data-item-id="item.id"
            class="checklist-item is-checked">
          <ChecklistItem
            :ref="(el) => setItemRef(item.id, el)"
            :label="item.label"
            :checked="true"
            @toggle="(c) => onItemToggle(item.id, c)"
            @label-change="(l) => onItemLabelChange(item.id, l)"
            @delete="onItemDelete(item.id)" />
        </li>
      </ul>

      <div class="note-actions">
        <ReminderPicker :reminder-at="note.reminderAt"
                        :reminder-recurrence="note.reminderRecurrence"
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
                @click="confirmDeleteNote"
                title="Delete note">
          <i class="bi bi-trash"></i>
        </button>
      </div>
    </div>
  `
};
