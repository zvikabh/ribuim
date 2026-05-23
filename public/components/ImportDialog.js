import { ref, computed } from "vue";
import { useImport } from "../composables/useImport.js";

export default {
  setup() {
    const {
      state, dialogOpen,
      importFromFile, applyFilter, confirmPending, cancelPending,
      closeDialog
    } = useImport();

    const fileInputRef = ref(null);
    const selectedFile = ref(null);
    const selectedFilter = ref("labels_or_reminders");

    function close() {
      selectedFile.value = null;
      selectedFilter.value = "labels_or_reminders";
      closeDialog();
    }

    function onFileChange(e) {
      selectedFile.value = e.target.files?.[0] || null;
    }

    function pickFile() {
      fileInputRef.value?.click();
    }

    async function startImport() {
      if (!selectedFile.value) return;
      await importFromFile(selectedFile.value);
    }

    function onApplyFilter() {
      applyFilter(selectedFilter.value);
    }

    function onConfirmLarge() {
      confirmPending();
    }

    function onCancelLarge() {
      cancelPending();
      selectedFile.value = null;
    }

    const progressPct = computed(() => {
      const t = state.value.totalKeepFiles;
      return t ? Math.round((state.value.processed / t) * 100) : 0;
    });

    const writePct = computed(() => {
      const t = state.value.toImport;
      return t ? Math.round((state.value.imported / t) * 100) : 0;
    });

    const phaseLabel = computed(() => {
      const labels = {
        idle: "Ready",
        reading: "Reading archive...",
        parsing: "Parsing notes...",
        filter_select: "Choose what to import",
        confirming: "Confirm import",
        writing: "Importing to Firestore...",
        done: "Done",
        error: "Error"
      };
      return labels[state.value.phase] || "";
    });

    const unsupportedList = computed(() =>
      Array.from(state.value.unsupportedFeatures || []).sort()
    );

    const canClose = computed(() =>
      ["idle", "done", "error"].includes(state.value.phase)
    );

    const fc = computed(() => state.value.filterCounts);

    return {
      dialogOpen, state, fileInputRef, selectedFile, selectedFilter,
      progressPct, writePct, phaseLabel, unsupportedList, canClose, fc,
      close, onFileChange, pickFile, startImport,
      onApplyFilter, onConfirmLarge, onCancelLarge
    };
  },
  template: `
    <teleport to="body">
      <div v-if="dialogOpen">
        <div class="modal-backdrop fade show"></div>
        <div class="modal fade show ribuim-modal"
             style="display:block"
             tabindex="-1"
             role="dialog">
          <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable" role="document">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title">
                  <i class="bi bi-box-arrow-in-down"></i>
                  Import from Google Keep
                </h5>
                <button v-if="canClose"
                        type="button"
                        class="btn-close"
                        @click="close"
                        aria-label="Close"></button>
              </div>

              <div class="modal-body">

                <!-- IDLE: file picker -->
                <template v-if="state.phase === 'idle'">
                  <p>
                    Upload a Google Takeout zip file containing your Keep data.
                    You can request one from
                    <a href="https://takeout.google.com" target="_blank" rel="noopener">
                      takeout.google.com
                    </a>
                    — select <strong>Keep</strong> and <strong>Tasks</strong>
                    (for reminders), then choose zip format.
                  </p>
                  <p class="text-muted small">
                    Notes with duplicate titles are treated as old recurrences
                    — only the most recent copy of each is imported.
                    Trashed and archived notes are skipped.
                  </p>
                  <input ref="fileInputRef"
                         type="file"
                         accept=".zip"
                         class="d-none"
                         @change="onFileChange">
                  <div class="d-flex gap-2 align-items-center">
                    <button class="btn btn-outline-primary" @click="pickFile">
                      <i class="bi bi-file-earmark-zip"></i>
                      Choose zip file
                    </button>
                    <span v-if="selectedFile" class="small text-muted text-truncate">
                      {{ selectedFile.name }}
                      ({{ Math.round(selectedFile.size / 1024 / 1024 * 10) / 10 }} MB)
                    </span>
                  </div>
                </template>

                <!-- PARSING / READING -->
                <template v-else-if="state.phase === 'reading' || state.phase === 'parsing'">
                  <div class="mb-2"><strong>{{ phaseLabel }}</strong></div>
                  <div class="progress mb-2" style="height:20px;">
                    <div class="progress-bar" :style="{ width: progressPct + '%' }">
                      {{ progressPct }}%
                    </div>
                  </div>
                  <div class="small text-muted">
                    Parsed {{ state.processed }} of {{ state.totalKeepFiles }} files
                  </div>
                </template>

                <!-- FILTER SELECT -->
                <template v-else-if="state.phase === 'filter_select'">
                  <div class="mb-2"><strong>{{ phaseLabel }}</strong></div>

                  <div class="small text-muted mb-3">
                    <span v-if="state.skipped">{{ state.skipped }} trashed/archived skipped. </span>
                    <span v-if="state.oldRecurrences">{{ state.oldRecurrences }} older copies filtered. </span>
                    <span v-if="state.remindersMatched">{{ state.remindersMatched }} reminders matched from Tasks.</span>
                  </div>

                  <div class="list-group">
                    <label class="list-group-item d-flex gap-2">
                      <input type="radio" class="form-check-input flex-shrink-0"
                             value="reminders" v-model="selectedFilter">
                      <span>
                        <strong>Reminders only</strong>
                        <span class="badge bg-secondary ms-1">{{ fc.reminders }}</span>
                        <br><small class="text-muted">Future one-shot and recurring reminders.</small>
                      </span>
                    </label>
                    <label class="list-group-item d-flex gap-2">
                      <input type="radio" class="form-check-input flex-shrink-0"
                             value="labels" v-model="selectedFilter">
                      <span>
                        <strong>Labeled notes only</strong>
                        <span class="badge bg-secondary ms-1">{{ fc.labels }}</span>
                        <br><small class="text-muted">Notes with at least one label.</small>
                      </span>
                    </label>
                    <label class="list-group-item d-flex gap-2">
                      <input type="radio" class="form-check-input flex-shrink-0"
                             value="labels_or_reminders" v-model="selectedFilter">
                      <span>
                        <strong>Labels or reminders</strong>
                        <span class="badge bg-secondary ms-1">{{ fc.labelsOrReminders }}</span>
                        <br><small class="text-muted">Notes that have a label, a reminder, or both.</small>
                      </span>
                    </label>
                    <label class="list-group-item d-flex gap-2">
                      <input type="radio" class="form-check-input flex-shrink-0"
                             value="everything" v-model="selectedFilter">
                      <span>
                        <strong>Everything</strong>
                        <span class="badge bg-secondary ms-1">{{ fc.everything }}</span>
                        <br><small class="text-muted">All notes (after dedup). May be slow to render.</small>
                      </span>
                    </label>
                  </div>
                </template>

                <!-- CONFIRMING -->
                <template v-else-if="state.phase === 'confirming'">
                  <div class="mb-2"><strong>{{ phaseLabel }}</strong></div>
                  <div class="alert alert-warning">
                    <p class="mb-2">
                      This will create
                      <strong>{{ state.toImport }} new notes</strong>
                      in Ribuim.
                    </p>
                    <p class="mb-0 small">
                      Continue? The view may be slow until you filter by label.
                    </p>
                  </div>
                </template>

                <!-- WRITING / DONE -->
                <template v-else-if="state.phase === 'writing' || state.phase === 'done'">
                  <div class="mb-2"><strong>{{ phaseLabel }}</strong></div>
                  <div class="progress mb-2" style="height:20px;">
                    <div class="progress-bar bg-success" :style="{ width: writePct + '%' }">
                      {{ writePct }}%
                    </div>
                  </div>
                  <div class="small">
                    <div>Imported: <strong>{{ state.imported }}</strong></div>
                    <div v-if="state.skipped">
                      Skipped (trashed/archived): <strong>{{ state.skipped }}</strong>
                    </div>
                    <div v-if="state.oldRecurrences">
                      Older copies filtered: <strong>{{ state.oldRecurrences }}</strong>
                    </div>
                    <div v-if="state.remindersMatched">
                      Reminders matched: <strong>{{ state.remindersMatched }}</strong>
                    </div>
                    <div v-if="state.failed" class="text-danger">
                      Failed: <strong>{{ state.failed }}</strong>
                    </div>
                  </div>
                  <div v-if="state.phase === 'done' && unsupportedList.length"
                       class="mt-3 alert alert-warning small">
                    <strong>Dropped (not supported by Ribuim):</strong>
                    <ul class="mb-0 mt-1">
                      <li v-for="f in unsupportedList" :key="f">{{ f }}</li>
                    </ul>
                  </div>
                </template>

                <!-- ERROR -->
                <template v-else-if="state.phase === 'error'">
                  <div class="mb-2"><strong>{{ phaseLabel }}</strong></div>
                  <div class="alert alert-danger">{{ state.errorMessage }}</div>
                </template>

              </div>

              <div class="modal-footer">
                <!-- IDLE -->
                <template v-if="state.phase === 'idle'">
                  <button type="button" class="btn btn-outline-secondary" @click="close">Cancel</button>
                  <button type="button" class="btn btn-primary" :disabled="!selectedFile" @click="startImport">
                    <i class="bi bi-cloud-upload"></i> Import
                  </button>
                </template>

                <!-- FILTER SELECT -->
                <template v-if="state.phase === 'filter_select'">
                  <button type="button" class="btn btn-outline-secondary" @click="close">Cancel</button>
                  <button type="button" class="btn btn-primary" @click="onApplyFilter">
                    <i class="bi bi-cloud-upload"></i> Import
                  </button>
                </template>

                <!-- CONFIRMING -->
                <template v-if="state.phase === 'confirming'">
                  <button type="button" class="btn btn-outline-secondary" @click="onCancelLarge">Cancel</button>
                  <button type="button" class="btn btn-primary" @click="onConfirmLarge">
                    <i class="bi bi-cloud-upload"></i> Import {{ state.toImport }} notes
                  </button>
                </template>

                <!-- DONE / ERROR -->
                <template v-if="canClose && state.phase !== 'idle'">
                  <button type="button" class="btn btn-primary" @click="close">Close</button>
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>
    </teleport>
  `
};
