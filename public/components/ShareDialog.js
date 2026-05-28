import { ref, computed } from "vue";
import { useNotes } from "../composables/useNotes.js";
import { useAuth } from "../composables/useAuth.js";
import { usePreferences } from "../composables/usePreferences.js";

const dialogOpen = ref(false);
const noteId = ref(null);
const noteRef = ref(null);
const inputValue = ref("");

export function openShareDialog(note) {
  noteId.value = note.id;
  noteRef.value = note;
  inputValue.value = "";
  dialogOpen.value = true;
}

export default {
  setup() {
    const { shareNote, unshareNote } = useNotes();
    const { currentUser } = useAuth();
    const { allUsers, getUserByEmail } = usePreferences();

    const sharedWith = computed(() =>
      (noteRef.value?.sharedWith || []).map(email => getUserByEmail(email))
    );

    const suggestions = computed(() => {
      const q = inputValue.value.trim().toLowerCase();
      if (!q) return [];
      const myEmail = currentUser.value?.email;
      const shared = new Set(noteRef.value?.sharedWith || []);
      return allUsers.value.filter(u => {
        if (u.email === myEmail) return false;
        if (shared.has(u.email)) return false;
        return u.email.toLowerCase().includes(q) ||
               (u.displayName || "").toLowerCase().includes(q);
      }).slice(0, 8);
    });

    async function addUser(email) {
      if (!noteId.value) return;
      await shareNote(noteId.value, email);
      inputValue.value = "";
    }

    async function removeUser(email) {
      if (!noteId.value) return;
      await unshareNote(noteId.value, email);
    }

    function close() {
      dialogOpen.value = false;
      noteId.value = null;
      noteRef.value = null;
    }

    function onKeydown(e) {
      if (e.key === "Enter") {
        e.preventDefault();
        if (suggestions.value.length) {
          addUser(suggestions.value[0].email);
        }
      } else if (e.key === "Escape") {
        close();
      }
    }

    return {
      dialogOpen, noteRef, inputValue, sharedWith, suggestions,
      addUser, removeUser, close, onKeydown
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
             @click.self="close">
          <div class="modal-dialog modal-dialog-centered" role="document">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title">
                  <i class="bi bi-people"></i>
                  Share "{{ (noteRef?.title || '').slice(0, 30) || 'Untitled' }}"
                </h5>
                <button type="button" class="btn-close"
                        @click="close" aria-label="Close"></button>
              </div>
              <div class="modal-body">
                <div class="share-input-wrap">
                  <input type="text"
                         class="form-control"
                         placeholder="Name or email"
                         v-model="inputValue"
                         @keydown="onKeydown">
                  <div v-if="suggestions.length" class="share-suggestions">
                    <button v-for="u in suggestions"
                            :key="u.email"
                            class="share-suggestion"
                            @mousedown.prevent="addUser(u.email)">
                      <img v-if="u.photoURL"
                           :src="u.photoURL"
                           class="share-avatar-sm"
                           referrerpolicy="no-referrer">
                      <span v-else class="share-avatar-sm share-avatar-placeholder">
                        {{ (u.displayName || u.email)[0] }}
                      </span>
                      <span class="share-suggestion-info">
                        <span class="share-suggestion-name">{{ u.displayName || u.email }}</span>
                        <span v-if="u.displayName" class="share-suggestion-email">{{ u.email }}</span>
                      </span>
                    </button>
                  </div>
                </div>

                <div v-if="sharedWith.length" class="share-list mt-3">
                  <div class="small text-muted mb-2">Shared with:</div>
                  <div v-for="u in sharedWith" :key="u.email" class="share-list-item">
                    <img v-if="u.photoURL"
                         :src="u.photoURL"
                         class="share-avatar"
                         referrerpolicy="no-referrer">
                    <span v-else class="share-avatar share-avatar-placeholder">
                      {{ (u.displayName || u.email)[0] }}
                    </span>
                    <span class="share-list-info">
                      <span class="share-list-name">{{ u.displayName || u.email }}</span>
                      <span v-if="u.displayName" class="share-list-email">{{ u.email }}</span>
                    </span>
                    <button class="btn btn-sm btn-outline-danger ms-auto"
                            @click="removeUser(u.email)">
                      Remove
                    </button>
                  </div>
                </div>

                <div v-else class="text-muted small mt-3">
                  Not shared with anyone yet.
                </div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-primary" @click="close">Done</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </teleport>
  `
};
