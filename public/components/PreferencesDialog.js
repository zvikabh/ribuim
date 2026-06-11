import { usePreferences } from "../composables/usePreferences.js";

export default {
  setup() {
    const { preferences, dialogOpen, closePreferences, updatePreference } = usePreferences();

    function onReminderColors(e) {
      updatePreference("reminderColors", e.target.value);
    }

    function onScreenUsage(e) {
      updatePreference("screenUsage", e.target.value);
    }

    function onMaxVisibleItems(e) {
      let n = parseInt(e.target.value, 10);
      if (isNaN(n)) n = 10;
      n = Math.min(15, Math.max(5, n));
      updatePreference("maxVisibleItems", n);
    }

    return {
      preferences, dialogOpen, closePreferences,
      onReminderColors, onScreenUsage, onMaxVisibleItems
    };
  },
  template: `
    <teleport to="body">
      <div v-if="dialogOpen">
        <div class="modal-backdrop fade show"></div>
        <div class="modal fade show ribuim-modal"
             style="display:block"
             tabindex="-1"
             role="dialog"
             @click.self="closePreferences">
          <div class="modal-dialog modal-dialog-centered pref-dialog" role="document">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title">
                  <i class="bi bi-gear"></i> Preferences
                </h5>
                <button type="button" class="btn-close"
                        @click="closePreferences" aria-label="Close"></button>
              </div>
              <div class="modal-body">

                <div class="mb-4">
                  <h6 class="mb-2">Reminder colors</h6>
                  <div class="list-group">
                    <label class="list-group-item d-flex gap-2">
                      <input type="radio" class="form-check-input flex-shrink-0"
                             name="reminderColors" value="by-time"
                             :checked="preferences.reminderColors === 'by-time'"
                             @change="onReminderColors">
                      <span>
                        <strong>Default</strong>
                        <br><small class="text-muted">
                          <span class="pref-swatch" style="background:#d93025"></span> Past due
                          <span class="pref-swatch" style="background:#f57c00"></span> 3h
                          <span class="pref-swatch" style="background:#f4b400"></span> 6h
                          <span class="pref-swatch" style="background:#34a853"></span> Later
                        </small>
                      </span>
                    </label>
                    <label class="list-group-item d-flex gap-2">
                      <input type="radio" class="form-check-input flex-shrink-0"
                             name="reminderColors" value="by-day"
                             :checked="preferences.reminderColors === 'by-day'"
                             @change="onReminderColors">
                      <span>
                        <strong>Psychedelic</strong>
                        <br><small class="text-muted">
                          <span class="pref-swatch" style="background:#6E88FF"></span> Sun
                          <span class="pref-swatch" style="background:#8CC9FF"></span> Mon
                          <span class="pref-swatch" style="background:#FFC15E"></span> Tue
                          <span class="pref-swatch" style="background:#FF9CF6"></span> Wed
                          <span class="pref-swatch" style="background:#D296FF"></span> Thu
                          <span class="pref-swatch" style="background:#FFEB4D"></span> Fri
                          <span class="pref-swatch" style="background:#D1D1D1"></span> Sat
                          <span class="pref-swatch" style="background:#F26150"></span> Past due
                        </small>
                      </span>
                    </label>
                    <label class="list-group-item d-flex gap-2">
                      <input type="radio" class="form-check-input flex-shrink-0"
                             name="reminderColors" value="no-colors"
                             :checked="preferences.reminderColors === 'no-colors'"
                             @change="onReminderColors">
                      <span>
                        <strong>No colors</strong>
                        <br><small class="text-muted">
                          <span class="pref-swatch" style="background:#f4b400"></span> All reminders
                        </small>
                      </span>
                    </label>
                  </div>
                </div>

                <div>
                  <h6 class="mb-2">Screen usage</h6>
                  <div class="list-group">
                    <label class="list-group-item d-flex gap-2">
                      <input type="radio" class="form-check-input flex-shrink-0"
                             name="screenUsage" value="default"
                             :checked="preferences.screenUsage === 'default'"
                             @change="onScreenUsage">
                      <span>
                        <strong>Default</strong>
                        <br><small class="text-muted">Standard spacing between notes.</small>
                      </span>
                    </label>
                    <label class="list-group-item d-flex gap-2">
                      <input type="radio" class="form-check-input flex-shrink-0"
                             name="screenUsage" value="cluttered"
                             :checked="preferences.screenUsage === 'cluttered'"
                             @change="onScreenUsage">
                      <span>
                        <strong>Cluttered</strong>
                        <br><small class="text-muted">Minimal spacing — fits more notes on screen.</small>
                      </span>
                    </label>
                  </div>
                </div>

                <div class="mt-4">
                  <h6 class="mb-2">Collapse long notes</h6>
                  <div class="pref-range-row">
                    <input type="range" min="5" max="15" step="1"
                           class="form-range"
                           :value="preferences.maxVisibleItems"
                           @input="onMaxVisibleItems">
                    <span class="pref-range-value">{{ preferences.maxVisibleItems }}</span>
                  </div>
                  <small class="text-muted">
                    Notes with more than {{ preferences.maxVisibleItems }} items are collapsed
                    behind a "show more" button.
                  </small>
                </div>

              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-primary" @click="closePreferences">
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
