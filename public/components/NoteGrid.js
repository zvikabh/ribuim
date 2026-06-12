import { ref, computed, watch, onBeforeUnmount, nextTick } from "vue";
import { useNotes } from "../composables/useNotes.js";
import { useView } from "../composables/useView.js";
import { usePreferences } from "../composables/usePreferences.js";
import { useCreateNote } from "../composables/useCreateNote.js";
import NoteCard from "./NoteCard.js";

const MIN_COL_WIDTH = 280;

export default {
  components: { NoteCard },
  setup() {
    const { loading, isPinnedForMe } = useNotes();
    const { currentView, currentViewLabel, filteredNotes } = useView();
    const { preferences } = usePreferences();
    const { createNoteAction, pendingScrollId } = useCreateNote();

    const showColumnAdd = computed(() =>
      currentView.value.type !== "trash" && currentView.value.type !== "shared"
    );

    const gridRef = ref(null);
    const numCols = ref(1);
    const heights = ref({});
    let resizeObserver = null;

    const gridPadding = computed(() => preferences.value.screenUsage === "cluttered" ? 4 : 16);
    const colGap = computed(() => preferences.value.screenUsage === "cluttered" ? 4 : 12);

    function updateCols() {
      const el = gridRef.value;
      if (!el) return;
      const available = el.clientWidth - gridPadding.value * 2;
      if (available <= 0) return;
      numCols.value = Math.max(1, Math.floor((available + colGap.value) / (MIN_COL_WIDTH + colGap.value)));
    }

    watch([gridPadding, colGap], updateCols);

    let lastObservedWidth = 0;
    watch(gridRef, (el) => {
      if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
      if (el) {
        lastObservedWidth = 0;
        // Only react to width changes. Re-measuring alters the grid's height,
        // so observing height too would loop.
        resizeObserver = new ResizeObserver((entries) => {
          const w = entries[0].contentRect.width;
          if (Math.abs(w - lastObservedWidth) < 1) return;
          lastObservedWidth = w;
          updateCols();
          nextTick(measureHeights);
        });
        resizeObserver.observe(el);
        updateCols();
        nextTick(measureHeights);
      }
    }, { flush: "post" });

    onBeforeUnmount(() => {
      if (resizeObserver) resizeObserver.disconnect();
    });

    function isNoteRtl(note) {
      const t = note.title || "";
      const rtl = (t.match(/[֐-׿؀-ۿ܀-ݏ]/g) || []).length;
      const ltr = (t.match(/[A-Za-z]/g) || []).length;
      return rtl > ltr;
    }

    const gridRtl = computed(() => {
      const notes = filteredNotes.value;
      if (!notes.length) return false;
      const rtlCount = notes.filter(isNoteRtl).length;
      return rtlCount > notes.length / 2;
    });

    // Rough fallback used only until a note has been measured in the DOM.
    function estimateNoteHeight(note) {
      let h = 90;
      if (note.title) h += 30;
      const items = note.items ? Object.keys(note.items).length : 0;
      h += Math.min(items, 7) * 28;
      if (items > 7) h += 25;
      if (note.labels?.length) h += 30;
      if (note.sharedWith?.length) h += 30;
      if (note.reminderAt && !note.reminderDone) h += 24;
      return h;
    }

    function noteHeight(note) {
      const m = heights.value[note.id];
      return (m && m > 0) ? m : estimateNoteHeight(note);
    }

    // Banded column fill: keeps reading order == sort order while staying
    // flush. First row gets one note per column (in order); then each round
    // fills every column (leading to trailing) down to the previous round's
    // lowest point, so rounds form disjoint top-to-bottom bands. Within a
    // band, earlier notes are in leading-or-higher positions; across bands,
    // later notes are strictly lower — together satisfying the invariant.
    function distribute(notes) {
      const n = numCols.value;
      const gap = colGap.value;
      const cols = Array.from({ length: n }, () => []);
      const bottoms = new Array(n).fill(0);
      let i = 0;

      for (let c = 0; c < n && i < notes.length; c++, i++) {
        cols[c].push(notes[i]);
        bottoms[c] = noteHeight(notes[i]);
      }
      let baseline = bottoms.length ? Math.max(...bottoms) : 0;

      while (i < notes.length) {
        let added = 0;
        for (let c = 0; c < n && i < notes.length; c++) {
          while (i < notes.length && bottoms[c] < baseline) {
            cols[c].push(notes[i]);
            bottoms[c] += gap + noteHeight(notes[i]);
            i++;
            added++;
          }
        }
        // Guarantee progress when every column already sits on the baseline.
        if (added === 0 && i < notes.length) {
          cols[0].push(notes[i]);
          bottoms[0] += gap + noteHeight(notes[i]);
          i++;
        }
        baseline = Math.max(...bottoms);
      }
      return cols;
    }

    // Reminders form a separate region above the rest. A note is an active
    // reminder only for its owner (shared/trashed notes never qualify).
    function isActiveReminder(note) {
      return note._isOwner !== false && !note.trashedAt
        && note.reminderAt && !note.reminderDone;
    }

    // Notes are split into up to four stacked regions, in this order:
    // pinned reminders, pinned others, reminders, others. Each is distributed
    // independently with the same banded fill. The unpinned "others" region
    // also hosts the add-note "+" columns (and renders even when empty so the
    // "+" is available, except in the reminders-only view).
    const regions = computed(() => {
      const fn = filteredNotes.value;
      const pinned = (n) => isPinnedForMe(n);
      const defs = [
        { key: "pinned-reminders", notes: fn.filter(n => pinned(n) && isActiveReminder(n)) },
        { key: "pinned-others", notes: fn.filter(n => pinned(n) && !isActiveReminder(n)) },
        { key: "reminders", notes: fn.filter(n => !pinned(n) && isActiveReminder(n)) },
        { key: "others", notes: fn.filter(n => !pinned(n) && !isActiveReminder(n)) }
      ];
      const out = [];
      for (const d of defs) {
        const keepEmptyForAdd = d.key === "others"
          && showColumnAdd.value && currentView.value.type !== "reminders";
        if (d.notes.length === 0 && !keepEmptyForAdd) continue;
        out.push({ key: d.key, columns: distribute(d.notes) });
      }
      return out;
    });

    // Measure rendered note heights so the banded fill uses true heights.
    // Width is fixed by numCols, so a note's height doesn't depend on which
    // column it lands in; one measurement pass after a layout change converges.
    function measureHeights() {
      const el = gridRef.value;
      if (!el) return;
      const next = { ...heights.value };
      let changed = false;
      el.querySelectorAll("[data-note-id]").forEach((node) => {
        const id = node.dataset.noteId;
        const h = node.offsetHeight;
        if (h && Math.abs((next[id] || 0) - h) > 0.5) {
          next[id] = h;
          changed = true;
        }
      });
      if (changed) heights.value = next;
    }

    // Re-measure when the note set or column geometry changes. This watch is
    // not triggered by `heights` itself, so updating heights doesn't loop.
    watch([filteredNotes, numCols, colGap], () => {
      nextTick(measureHeights);
    });

    // A card changed height without any note-data change (expand/collapse).
    // Re-measure so the banded layout reflows.
    function onCardLayoutChange() {
      nextTick(measureHeights);
    }

    function scrollToAndHighlight(noteId) {
      const el = gridRef.value?.querySelector(`[data-note-id="${noteId}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      const card = el.querySelector(".note-card") || el;
      card.classList.add("note-card-highlight");
      card.addEventListener("animationend", () => {
        card.classList.remove("note-card-highlight");
      }, { once: true });
    }

    // A note flagged for scrolling (newly created, or moved because a reminder
    // was added) gets scrolled into view and highlighted once it renders here.
    // Freshly created notes also get their title focused.
    watch(pendingScrollId, async (req) => {
      if (!req) return;
      const { id, focus } = req;
      await nextTick();
      setTimeout(() => {
        scrollToAndHighlight(id);
        if (focus) {
          const titleInput = gridRef.value?.querySelector(`[data-note-id="${id}"] .note-title-input`);
          if (titleInput) titleInput.focus();
        }
        pendingScrollId.value = null;
      }, 150);
    });

    return {
      loading, currentView, currentViewLabel, filteredNotes,
      gridRef, gridRtl, regions, onCardLayoutChange,
      showColumnAdd, addNote: createNoteAction
    };
  },
  template: `
    <div>
      <div v-if="loading && !filteredNotes.length" class="empty-state">
        <i class="bi bi-hourglass-split"></i>
        Loading...
      </div>

      <div v-else-if="!filteredNotes.length && currentView.type === 'all'" class="empty-state">
        <i class="bi bi-journal-text"></i>
        No notes yet. Tap the + button to create one.
      </div>

      <div v-else-if="!filteredNotes.length && currentView.type === 'trash'" class="empty-state">
        <i class="bi bi-trash"></i>
        Trash is empty.
      </div>

      <div v-else-if="!filteredNotes.length" class="empty-state">
        <i class="bi bi-search"></i>
        No notes in <strong>{{ currentViewLabel }}</strong>.
      </div>

      <div v-else ref="gridRef" class="note-grid-regions">
        <div v-for="region in regions"
             :key="region.key"
             class="note-grid"
             :class="'region-' + region.key"
             :dir="gridRtl ? 'rtl' : 'ltr'">
          <div v-for="(col, ci) in region.columns" :key="ci" class="note-grid-col">
            <div v-for="note in col" :key="note.id" :data-note-id="note.id">
              <NoteCard :note="note" @layout-change="onCardLayoutChange" />
            </div>
            <button v-if="showColumnAdd && region.key === 'others'"
                    class="column-add-note"
                    @click="addNote"
                    title="Add note">
              <i class="bi bi-plus-lg"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  `
};
