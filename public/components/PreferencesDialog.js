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

    return { preferences, dialogOpen, closePreferences, onReminderColors, onScreenUsage };
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
          <div class="modal-dialog modal-dialog-centered" role="document">
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
                          <span class="pref-swatch" style="background:#1a73e8"></span> Sun
                          <span class="pref-swatch" style="background:#00acc1"></span> Mon
                          <span class="pref-swatch" style="background:#f57c00"></span> Tue
                          <span class="pref-swatch" style="background:#34a853"></span> Wed
                          <span class="pref-swatch" style="background:#9c27b0"></span> Thu
                          <span class="pref-swatch" style="background:#f4b400"></span> Fri
                          <span class="pref-swatch" style="background:#5f6368"></span> Sat
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
