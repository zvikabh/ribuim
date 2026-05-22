# Ribuim Design Document

A personal checklist app inspired by Google Keep, for a small group of whitelisted family members.

---

## 1. Architecture Overview

```
Browser (SPA)
  ├── Vue.js 3 (CDN, no build step)
  ├── Bootstrap 5 (CDN)
  ├── SortableJS (CDN, drag-and-drop)
  └── Firebase JS SDK (modular, CDN)
        ├── firebase/auth (Google OAuth)
        └── firebase/firestore (real-time + offline)
              │
              ▼
Firebase
  ├── Hosting (static files)
  ├── Auth (Google OAuth provider)
  └── Cloud Firestore (data + security rules)
```

All logic runs in the browser. There is no application server. Firestore security
rules enforce authorization. The app is deployed as static files to Firebase Hosting.

**Optional Tier 2 (Blaze plan):** Add Cloud Functions + Firebase Cloud Messaging for
push notifications that work when the browser is closed. See section 7.

---

## 2. Authentication & Authorization

1. User clicks "Sign in with Google." Firebase Auth handles the OAuth flow.
2. On successful auth, the app attempts to read from Firestore.
3. Firestore security rules check that the user's email exists in the `allowedUsers`
   collection. If not, the read fails with `permission-denied`.
4. The app catches this error and shows: "Your account hasn't been approved yet.
   Ask the admin to add you."

The `allowedUsers` collection is managed manually via the Firebase Console. No
client can read or write it directly — security rules use `exists()` to check
membership without exposing the collection.

Firebase Auth defaults to `browserLocalPersistence`, so users stay signed in across
browser sessions without re-authenticating.

---

## 3. Firestore Data Model

### Collection: `allowedUsers`

```
/allowedUsers/{email}
{
  displayName: "Alice",          // optional, for admin readability
  addedAt: Timestamp
}
```

Document ID = the user's email address (e.g. `alice@gmail.com`). Populated manually
via the Firebase Console. The admin can pre-populate this before anyone signs in,
since email addresses are known in advance.

### Collection: `notes`

```
/notes/{noteId}
{
  ownerEmail: "alice@gmail.com",           // owner's email
  title: "",                              // optional, empty string if unset
  createdAt: Timestamp,                   // server timestamp, set once, immutable
  reminderAt: Timestamp | null,           // null = no reminder; otherwise the next un-completed due time
  reminderRecurrence: "none"|"daily"|"weekly",  // recurrence rule (default "none")
  reminderDone: false,                    // true = one-shot reminder dismissed; always false for recurring

  items: {                                // MAP of checkbox items
    "item_abc123": { label: "Milk", checked: false },
    "item_def456": { label: "Eggs", checked: true }
  },

  itemOrder: ["item_abc123", "item_def456"]  // display order
}
```

**Why a flat `/notes` collection instead of `/users/{email}/notes`?** It makes the
future shared-lists feature straightforward: add a `sharedWith: ["bob@gmail.com"]`
field and adjust security rules. No structural migration needed.

**Why a map for `items` plus a separate `itemOrder` array?** This is the key data
model decision. When Device A checks "Milk" and Device B edits "Eggs" simultaneously,
they issue non-overlapping writes:

- Device A: `updateDoc(noteRef, { "items.item_abc123.checked": true })`
- Device B: `updateDoc(noteRef, { "items.item_def456.label": "Organic Eggs" })`

These target different dot-notation paths and Firestore merges them without conflict.
If items were stored as an array, any write would replace the entire array, causing
last-write-wins data loss.

The `itemOrder` array is the one intentional bottleneck — reordering is a whole-list
operation. But reordering is infrequent, and for ~10 users editing their own notes,
practical conflicts on `itemOrder` are near zero.

**Item ID generation:** `crypto.randomUUID()` in the browser. No need for Firestore
auto-IDs since items live inside a single document.

---

## 4. Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAllowedUser() {
      return request.auth != null
        && exists(/databases/$(database)/documents/allowedUsers/$(request.auth.token.email));
    }

    function isOwner() {
      return request.auth.token.email == resource.data.ownerEmail;
    }

    match /allowedUsers/{userId} {
      allow read, write: if false;  // admin-only via Firebase Console
    }

    match /notes/{noteId} {
      allow read: if isAllowedUser() && isOwner();

      allow create: if isAllowedUser()
        && request.resource.data.ownerEmail == request.auth.token.email
        && request.resource.data.createdAt == request.time;

      allow update: if isAllowedUser()
        && isOwner()
        && request.resource.data.ownerEmail == resource.data.ownerEmail
        && request.resource.data.createdAt == resource.data.createdAt;

      allow delete: if isAllowedUser() && isOwner();
    }

    match /fcmTokens/{tokenId} {
      allow read: if false;
      allow create, update: if isAllowedUser()
        && request.resource.data.ownerEmail == request.auth.token.email;
      allow delete: if isAllowedUser()
        && resource.data.ownerEmail == request.auth.token.email;
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

Key enforcement points:
- `createdAt` must equal `request.time` on create, cannot change on update (immutable).
- `ownerEmail` must match the authenticated user's email on create, cannot change on update.
- The `exists()` call checks `request.auth.token.email` against document IDs in
  `allowedUsers`, so the admin just creates docs named by email address.
- The `exists()` call on `allowedUsers` does not count against the daily read quota.

---

## 5. UI Design

### Layout

The app uses CSS multi-column layout for the Keep-style card grid — no JS masonry
library needed:

```css
.note-grid {
  columns: 280px;
  column-gap: 12px;
  padding: 16px;
}
.note-card {
  break-inside: avoid;
  margin-bottom: 12px;
}
@media (max-width: 600px) {
  .note-grid { columns: 1; }
}
```

Cards flow left-to-right, top-to-bottom on desktop and stack vertically on mobile.

### Component Tree

```
App
├── LoginScreen              (shown when not authenticated)
├── AppHeader                (user avatar, sign-out button)
├── ReminderBanner           (fixed top bar for due reminders)
├── CreateNoteButton         (FAB on mobile, button in header on desktop)
└── NoteGrid
    └── NoteCard (×N)
        ├── NoteTitle        (inline editable)
        ├── ReminderBadge    (colored pill)
        ├── ChecklistContainer (SortableJS drag zone)
        │   └── ChecklistItem (×N)
        │       ├── Checkbox
        │       ├── ItemLabel (inline editable input)
        │       └── DeleteItemButton
        ├── AddItemRow       (input to add new checkbox)
        ├── ReminderPicker   (<input type="datetime-local">)
        └── NoteActions      (delete note, set/clear reminder)
```

### Inline Editing

All text editing is inline — no expand-to-edit modal like Google Keep. Checkbox labels
and note titles use `<input type="text">` elements styled with minimal borders
(`border: none; border-bottom: 1px solid #eee` on focus). This avoids the complexity
of `contenteditable`.

- Text changes: debounced Firestore writes (500ms).
- Checkbox toggles: immediate writes.
- Drag-and-drop reorder: writes on drag end.

### Note Ordering

Notes are sorted client-side via a computed property:

1. **Notes with active reminders** (`reminderAt != null && !reminderDone`), sorted by
   `reminderAt` ascending. Past-due reminders appear first, followed by upcoming ones.
2. **Notes without reminders** (or with `reminderDone == true`), sorted by `createdAt`
   descending (newest first).

### Checked Items

Within each note, checked items move to the bottom of the list with a strikethrough,
preserving their relative order. This is a display-time computation — `itemOrder`
stores the user's drag-set order, and the rendered order is:
`[unchecked items in itemOrder sequence] ++ [checked items in itemOrder sequence]`.

Checked items are not draggable (SortableJS `filter` option excludes them).

### Reminder Color Coding

The `ReminderBadge` shows the reminder datetime as a colored pill:

| Condition | Color | Bootstrap class |
|-----------|-------|-----------------|
| Past due | Red | `bg-danger` |
| Within 3 hours | Orange | `bg-warning text-dark` |
| Within 6 hours | Yellow | `bg-warning-subtle` |
| > 6 hours away | Green | `bg-success` |

The badge re-evaluates its color every 60 seconds via `setInterval`.

### Marking a Reminder Done

For one-shot reminders (`reminderRecurrence === "none"`), sets `reminderDone: true`.
The original `reminderAt` is preserved so the user can see when it was set. The note
moves from the "reminders" section to the "by creation date" section. The user can
later set a new reminder.

For recurring reminders (`daily` or `weekly`), Done advances `reminderAt` to the next
occurrence strictly after now (computed from `reminderAt`'s time-of-day, plus its
weekday for weekly). `reminderDone` stays false — recurring reminders are never
permanently "done", only acknowledged for the current occurrence.

### Recurring Reminders

- **Daily:** the time-of-day of `reminderAt` is the repeating slot. Done advances to
  the next occurrence of that time-of-day after now.
- **Weekly:** the weekday + time-of-day of `reminderAt` is the repeating slot. Done
  advances by 7 days (or more if multiple weeks were skipped).
- At creation, if the user picks a past datetime for a recurring reminder, the stored
  `reminderAt` is normalized to the next occurrence after now (so the very first
  reminder is in the future, not stale).
- Sort order is unchanged — `sortedNotes` sorts by `reminderAt` ascending, so a
  recurring reminder's overdue occurrence naturally floats to the top of the list.

---

## 6. Real-time Sync

### Firestore Listener

A single collection-level `onSnapshot` listener fetches all notes for the current user:

```javascript
const q = query(collection(db, "notes"), where("ownerEmail", "==", currentUser.email));
onSnapshot(q, (snapshot) => {
  snapshot.docChanges().forEach((change) => {
    if (change.type === "added")    addNoteToState(change.doc);
    if (change.type === "modified") updateNoteInState(change.doc);
    if (change.type === "removed")  removeNoteFromState(change.doc.id);
  });
});
```

One listener is more efficient than per-document listeners. Sorting happens client-side
since the two-tier sort is complex to express as a Firestore query, and data volume is
tiny (dozens of notes, not thousands).

### Offline Support

Firestore persistent local cache is enabled at initialization:

```javascript
const db = initializeFirestore(app, {
  localCache: persistentLocalCache()
});
```

Changes made offline are queued and synced automatically when connectivity resumes.

### Write Operations

| Action | Firestore call | Debounce |
|--------|---------------|----------|
| Create note | `addDoc` with `serverTimestamp()` | No |
| Delete note | `deleteDoc` | No |
| Toggle checkbox | `updateDoc` with dot-notation | No |
| Edit label | `updateDoc` with dot-notation | 500ms |
| Edit title | `updateDoc` | 500ms |
| Reorder items | `updateDoc` with new `itemOrder` array | No |
| Add item | `updateDoc` with map entry + `arrayUnion` | No |
| Delete item | `updateDoc` with `deleteField()` + `arrayRemove` | No |

Adding and deleting items combine map and array operations in a single atomic
`updateDoc` call.

---

## 7. Reminder Notifications

### Tier 1: Client-Side Only (Spark Plan — free, no credit card)

Works when the browser tab is open. A `setInterval` (every 30 seconds) checks for
due reminders. When one is found:

1. An in-page banner appears at the top of the viewport with the note title,
   "View" button (scrolls to card), and "Done" button (marks reminder done).
2. If browser notification permission is granted, a `new Notification()` fires.
   This works even when the tab is not focused, as long as the browser is running.

The app requests notification permission on the user's first interaction (not on
page load, to avoid the permission prompt being auto-denied).

**Limitation:** No notifications when the browser is closed.

### Tier 2: Push Notifications (Blaze Plan — still $0 at this scale)

Adds true push notifications via Firebase Cloud Messaging + a scheduled Cloud Function:

1. On login, the app registers an FCM token and stores it in `/fcmTokens/{hash}`.
2. A Cloud Function runs every 60 seconds, queries notes where
   `reminderAt <= now AND reminderDone == false AND notificationSent != true`.
3. For each match, it sends an FCM push notification to the user's registered tokens
   and sets `notificationSent: true` on the note.
4. A service worker (`firebase-messaging-sw.js`) receives the push and shows the
   notification even when the browser is closed.

The `notificationSent` flag keeps Cloud Function reads near zero for most invocations,
staying well within the free tier.

**Recommendation:** Start with Tier 1. Upgrade to Tier 2 only if family members
report missing reminders. The upgrade path is additive — Tier 1 code stays as-is.

---

## 8. Firebase Free Tier Analysis

### Spark Plan (10 users, casual use)

| Resource | Free Limit | Est. Daily Use | Headroom |
|----------|-----------|----------------|----------|
| Firestore reads | 50,000/day | ~2,000 | 25x |
| Firestore writes | 20,000/day | ~500 | 40x |
| Firestore deletes | 20,000/day | ~50 | 400x |
| Firestore storage | 1 GB | ~1 MB | 1,000x |
| Hosting storage | 10 GB | ~500 KB | 20,000x |
| Hosting transfer | 360 MB/day | ~5 MB | 72x |
| Auth | Unlimited | ~10/day | N/A |

The app would need ~250+ daily active users before approaching any limit.

### Blaze Plan Incremental (if Tier 2 notifications added)

| Resource | Free Allowance | Est. Monthly Use | Cost |
|----------|---------------|------------------|------|
| Cloud Functions invocations | 2M/month | ~43,200 | $0 |
| Cloud Functions compute | 400K GB-s | ~2,160 GB-s | $0 |
| Cloud Scheduler | 3 jobs | 1 job | $0 |
| FCM messages | Unlimited | ~100 | $0 |

Estimated Blaze plan cost: **$0/month**. Requires a credit card on file.

---

## 9. Tech Stack

| Library | Size (gzip) | Role |
|---------|-------------|------|
| Vue.js 3 (CDN) | ~40 KB | Reactive UI, components, computed properties |
| Bootstrap 5 (CDN) | ~25 KB CSS | Cards, grid, forms, buttons, utilities |
| SortableJS (CDN) | ~10 KB | Touch-friendly drag-and-drop |
| Firebase JS SDK (modular) | ~50 KB | Auth, Firestore |

**Total: ~125 KB gzipped.** No build step. All dependencies loaded via CDN using
ES module import maps.

All Vue components are `.js` files using template string literals (no `.vue` SFC files,
which would require a bundler).

---

## 10. File Structure

```
ribuim/
├── firebase.json
├── firestore.rules
├── firestore.indexes.json
├── .firebaserc
└── public/
    ├── index.html                   (SPA shell + import map + Bootstrap)
    ├── app.js                       (Vue app entry, Firebase init, auth state)
    ├── style.css                    (card grid, Bootstrap overrides)
    ├── composables/
    │   ├── useAuth.js               (sign in/out, current user)
    │   ├── useNotes.js              (CRUD, real-time listener, sorting)
    │   └── useReminders.js          (reminder checking, in-page notifications)
    ├── components/
    │   ├── LoginScreen.js
    │   ├── AppHeader.js
    │   ├── NoteGrid.js
    │   ├── NoteCard.js              (most complex: editing, drag, reminders)
    │   ├── ChecklistItem.js
    │   ├── ReminderBadge.js
    │   ├── ReminderBanner.js
    │   └── ReminderPicker.js
    └── icon-192.png                 (notification icon)
```

---

## 11. Implementation Gotchas

**Drag-and-drop with checked items at bottom.** The visual order is a computed
projection of `itemOrder`. On drag end, reconstruct `itemOrder` from the new DOM
order. Checked items are excluded from dragging via SortableJS `filter`.

**Debounced writes and deleted notes.** If a user types in a label while another device
deletes the note, the debounced write fires on a non-existent document. Catch and
ignore `not-found` errors on debounced writes.

**Firestore listener double-fires on local writes.** `onSnapshot` fires once with the
local optimistic update and once on server confirmation. Vue's reactivity handles this
naturally (same data = no visual change), but be aware if adding animations.

**Write cost of typing.** At 500ms debounce, editing a label generates roughly one
write per word. At ~50 edits/day across 10 users, this stays well under the 20K/day
write limit. Increase debounce to 1000ms or write-on-blur if concerned.

**`reminderDone` vs clearing `reminderAt`.** Setting `reminderDone: true` preserves the
original reminder time (informational) and makes "undo" trivial (set `reminderDone:
false`). Clearing `reminderAt` would lose this data.

---

## 12. Future Extension: Shared Lists

The flat `/notes` collection is designed for this. Migration path:

1. Add `sharedWith: string[]` field to notes (array of email addresses).
2. Update security rules: allow read/write if `request.auth.token.email in resource.data.sharedWith`.
3. Add a second query: `where("sharedWith", "array-contains", currentUser.email)`.
4. Merge both query results client-side.

No data migration or structural changes required.
