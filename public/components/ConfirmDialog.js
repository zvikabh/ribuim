import { onMounted, onBeforeUnmount, watch } from "vue";
import { useConfirmDialog } from "../composables/useConfirmDialog.js";

export default {
  setup() {
    const { state, respond } = useConfirmDialog();

    function onKeydown(e) {
      if (!state.value.open) return;
      if (e.key === "Escape") {
        e.preventDefault();
        respond(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        respond(true);
      }
    }

    onMounted(() => { document.addEventListener("keydown", onKeydown); });
    onBeforeUnmount(() => { document.removeEventListener("keydown", onKeydown); });

    watch(() => state.value.open, (open) => {
      document.body.style.overflow = open ? "hidden" : "";
    });

    function onBackdrop(e) {
      if (e.target === e.currentTarget) respond(false);
    }

    return { state, respond, onBackdrop };
  },
  template: `
    <teleport to="body">
      <div v-if="state.open">
        <div class="modal-backdrop fade show"></div>
        <div class="modal fade show ribuim-modal"
             style="display:block"
             tabindex="-1"
             role="dialog"
             @click="onBackdrop">
          <div class="modal-dialog modal-dialog-centered" role="document">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title">{{ state.title }}</h5>
                <button type="button" class="btn-close" @click="respond(false)" aria-label="Close"></button>
              </div>
              <div class="modal-body">
                <p class="mb-0">{{ state.message }}</p>
              </div>
              <div class="modal-footer">
                <button type="button"
                        class="btn btn-outline-secondary"
                        @click="respond(false)">
                  {{ state.cancelLabel }}
                </button>
                <button type="button"
                        class="btn"
                        :class="'btn-' + state.variant"
                        @click="respond(true)"
                        ref="confirmBtn">
                  {{ state.confirmLabel }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </teleport>
  `
};
