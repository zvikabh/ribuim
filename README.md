# Ribuim

A personal checklist app inspired by Google Keep. Single-page static webapp on
Firebase Hosting + Firestore, for a small group of whitelisted users.

See [DESIGN.md](./DESIGN.md) for the architecture (or the equivalent plan file).

## Features

- Google OAuth sign-in, restricted to an admin-managed allowlist.
- Notes with optional title, checkboxes (with drag-and-drop reordering), and
  optional reminders.
- Reminders shown as colored badges (red = past due, orange/yellow/green by
  proximity) and as in-page banners + browser notifications when due.
- Real-time sync across devices via Firestore listeners.
- Responsive: multi-column card grid on desktop, single column on mobile.
- Offline support via Firestore persistent local cache.
- Stays within Firebase Spark (free) tier for ~10 users.

## One-time setup

### 1. Create a Firebase project

1. Go to <https://console.firebase.google.com> and create a new project.
2. Add a Web app to the project. Note the `firebaseConfig` snippet that's shown.
3. Enable **Authentication** -> Sign-in method -> Google.
4. Enable **Cloud Firestore** -> Create database -> Start in production mode
   (the security rules in this repo will be deployed next).

### 2. Configure the app

Edit `public/firebase-init.js` and paste your project's `firebaseConfig` values
in place of the `REPLACE_ME` placeholders.

Edit `.firebaserc` and replace `REPLACE_WITH_YOUR_FIREBASE_PROJECT_ID` with
your actual Firebase project ID.

### 3. Install the Firebase CLI and deploy

```bash
npm install -g firebase-tools
firebase login
firebase deploy
```

This deploys Firestore security rules, indexes, and the static hosting files.

### 4. Allowlist your users

In the Firebase Console -> Firestore Database, create a collection called
`allowedUsers`. For each user, add a document where:

- The **Document ID** is the user's Google account email
  (e.g. `alice@gmail.com`).
- The document can have optional fields:
  - `displayName` (string) — for your own readability
  - `addedAt` (timestamp) — set to "now" using the Firestore console

Only documents whose IDs match users' email addresses grant access. You can
pre-populate this before anyone signs in.

### 5. Share the URL

Your app is at `https://<your-project-id>.web.app`. Family members visit that
URL, click "Sign in with Google", and they're in (if they're allowlisted).

## Local development

The app is plain static files — no build step. You can serve it locally with
any static file server. Two easy options:

```bash
# With the Firebase CLI (recommended — emulates hosting):
firebase emulators:start --only hosting

# Or with Python:
cd public && python3 -m http.server 8000
```

Then open <http://localhost:8000> (or whichever port).

Note: Firebase Auth requires `localhost` or your deployed domain to be in the
authorized domains list. `localhost` is added by default.

## Managing the allowlist

Add/remove users by creating/deleting documents in the `allowedUsers`
collection in the Firebase Console. No redeployment needed — changes take
effect on the next read.

## Free-tier headroom

For ~10 users using this casually, the app should use roughly 5% of the
Firestore daily read/write free tier. See DESIGN.md / the plan file for the
detailed budget.

## Project layout

```
ribuim/
├── firebase.json              # Hosting + Firestore CLI config
├── firestore.rules            # Security rules
├── firestore.indexes.json     # Composite indexes (none required)
├── .firebaserc                # Project alias
└── public/                    # Deployed static files
    ├── index.html             # SPA shell + import map
    ├── app.js                 # Vue app root
    ├── firebase-init.js       # Firebase config + initialization
    ├── style.css
    ├── composables/           # Vue composables (auth, notes, reminders)
    └── components/            # Vue components (cards, items, etc.)
```

## Optional: push notifications (Blaze tier)

The current implementation uses in-page notifications + the browser
Notification API. These only fire when the browser tab/window is open. For
true push notifications that work when the browser is closed, you would
need to add Firebase Cloud Messaging + a scheduled Cloud Function. This
requires switching to the Blaze (pay-as-you-go) plan, though actual cost
for ~10 users stays at $0. Not implemented in this version.
