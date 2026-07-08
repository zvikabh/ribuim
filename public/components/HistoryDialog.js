import { ref, computed } from "vue";
import { useUndo } from "../composables/useUndo.js";

export default {
  setup() {
    const {
      historyOpen, closeHistory,
      undoActions, redoActions, undoMany, redoMany
    } = useUndo();

    // Future actions (redoable), furthest-future first so the nearest one sits
    // just above the "current" marker. count = how many redos to reach it.
    const redoRows = computed(() =>
      redoActions.value.map((desc, i) => ({
        desc, type: "redo", count: redoActions.value.length - i
      }))
    );

    // Past actions (undoable), most-recent first so the nearest one sits just
    // below the "current" marker. count = how many undos to reach it.
    const undoRows = computed(() =>
      undoActions.value.slice().reverse().map((desc, j) => ({
        desc, type: "undo", count: j + 1
      }))
    );

    const isEmpty = computed(() => !redoRows.value.length && !undoRows.value.length);

    // Hovered row → highlight every row between it and the present.
    const hover = ref(null); // { type, count }

    function onEnter(row) { hover.value = { type: row.type, count: row.count }; }
    function onLeave() { hover.value = null; }

    function inRange(row) {
      return hover.value && hover.value.type === row.type && row.count <= hover.value.count;
    }

    function rowMessage(row) {
      const verb = row.type === "undo" ? "Undo" : "Redo";
      return `${verb} ${row.count} action${row.count === 1 ? "" : "s"}`;
    }

    const hoverMessage = computed(() => hover.value ? rowMessage(hover.value) : "");

    async function onClick(row) {
      hover.value = null;
      if (row.type === "undo") await undoMany(row.count);
      else await redoMany(row.count);
    }

    return {
      historyOpen, closeHistory,
      redoRows, undoRows, isEmpty,
      onEnter, onLeave, inRange, rowMessage, hoverMessage, onClick
    };
  },
  template: `
    <teleport to="body">
      <div v-if="historyOpen">
        <div class="modal-backdrop fade show"></div>
        <div class="modal fade show ribuim-modal"
             style="display:block"
             tabindex="-1"
             role="dialog"
             @click.self="closeHistory">
          <div class="modal-dialog modal-dialog-centered" role="document">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title">
                  <i class="bi bi-clock-history"></i> Recent actions
                </h5>
                <button type="button" class="btn-close"
                        @click="closeHistory" aria-label="Close"></button>
              </div>
              <div class="modal-body">
                <p v-if="isEmpty" class="text-muted mb-0">No recent actions yet.</p>

                <div v-else class="history-list">
                  <div v-for="row in redoRows"
                       :key="'r' + row.count"
                       class="history-row redo"
                       :class="{ highlight: inRange(row) }"
                       :title="rowMessage(row)"
                       @mouseenter="onEnter(row)"
                       @mouseleave="onLeave"
                       @click="onClick(row)">
                    <i class="bi bi-arrow-clockwise history-row-icon"></i>
                    <span class="history-row-text">{{ row.desc }}</span>
                  </div>

                  <div class="history-current">
                    <span class="history-current-dot"></span>
                    Current state
                  </div>

                  <div v-for="row in undoRows"
                       :key="'u' + row.count"
                       class="history-row undo"
                       :class="{ highlight: inRange(row) }"
                       :title="rowMessage(row)"
                       @mouseenter="onEnter(row)"
                       @mouseleave="onLeave"
                       @click="onClick(row)">
                    <i class="bi bi-arrow-counterclockwise history-row-icon"></i>
                    <span class="history-row-text">{{ row.desc }}</span>
                  </div>
                </div>
              </div>
              <div class="modal-footer">
                <span class="history-hint text-muted me-auto">{{ hoverMessage }}</span>
                <button type="button" class="btn btn-primary" @click="closeHistory">
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </teleport>
  `
};
