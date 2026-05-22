# Ribuim — Firebase Setup Guide

Click-by-click walkthrough for first-time setup. Should take ~15 minutes.

You need: a Google account, Node.js 18+ installed (`node -v` to check),
and this repo cloned locally.

---

## 1. Create the Firebase project

1. Go to <https://console.firebase.google.com>.
2. Click **Add project** (or **Create a project**).
3. Enter a project name, e.g. `ribuim`. Click **Continue**.
4. **Google Analytics:** turn this **off** — you don't need it for a family
   app, and it adds extra setup. Click **Continue** (or **Create project**).
5. Wait for "Your new project is ready". Click **Continue**.

You'll land on the project dashboard. Note your **Project ID** — it's
shown under the project name (e.g. `ribuim-a1b2c`). It may differ from
the name you typed.

## 2. Register a Web app

1. On the dashboard, find the **"Get started by adding Firebase to your app"**
   row and click the **`</>`** (Web) icon.
2. **App nickname:** anything, e.g. `Ribuim Web`.
3. **Firebase Hosting:** leave the checkbox unchecked here — we'll set up
   hosting via the CLI in step 5.
4. Click **Register app**.
5. Firebase shows a code snippet starting with `const firebaseConfig = { ... }`.
   **Copy the whole `firebaseConfig` object.** You'll paste it into the app
   in step 4 below. (If you miss it, you can find it again later via
   Project Settings → General → Your apps → SDK setup and configuration.)
6. Click **Continue to console**. Skip the "install SDK" step — we load
   Firebase from CDN.

## 3. Enable Google sign-in

1. Left sidebar → **Build** → **Authentication**.
2. Click **Get started**.
3. Under **Sign-in providers**, click **Google**.
4. Toggle **Enable** on.
5. **Project support email:** select your email from the dropdown.
6. Click **Save**.

## 4. Enable Cloud Firestore

1. Left sidebar → **Build** → **Firestore Database**.
2. Click **Create database**.
3. **Pick a location** — this is **permanent** and can't be changed later.
   Pick the region closest to your family (e.g. `us-central1`,
   `europe-west1`, `asia-northeast1`). Click **Next**.
4. **Rules:** choose **Start in production mode** (NOT test mode — our
   rules will be deployed in step 6 and they're stricter than test mode).
5. Click **Create**. Wait for provisioning (30–60 seconds).

## 5. Install and log into the Firebase CLI

```bash
npm install -g firebase-tools
firebase login
```

`firebase login` opens a browser tab. Sign in with the **same Google
account** that owns the Firebase project.

## 6. Wire the local repo to your project

From the repo root (`ribuim/`):

1. **Edit `.firebaserc`** — replace `REPLACE_WITH_YOUR_FIREBASE_PROJECT_ID`
   with your Project ID from step 1. Example:
   ```json
   {
     "projects": {
       "default": "ribuim-a1b2c"
     }
   }
   ```

2. **Edit `public/firebase-init.js`** — replace the `firebaseConfig` object
   with the one you copied in step 2.5. Just paste over the placeholder
   block; keep everything else in the file as-is.

3. (Optional sanity check) Run `firebase use` from the repo root — it
   should print your project alias as the active project.

## 7. Deploy

From the repo root:

```bash
firebase deploy
```

This deploys three things:
- Firestore security rules (`firestore.rules`)
- Firestore indexes (`firestore.indexes.json`)
- Hosting files (`public/`)

When it finishes, the CLI prints a **Hosting URL** like
`https://ribuim-a1b2c.web.app`. That's your app.

## 8. Allowlist your family members

For each person you want to grant access to:

1. Firebase Console → **Firestore Database** → **Data** tab.
2. **First user only:** click **+ Start collection**.
   - **Collection ID:** `allowedUsers` (exact spelling, case matters)
   - Click **Next**.

   For each subsequent user, instead click the `allowedUsers` collection
   in the leftmost panel and then click **+ Add document**.

3. **Document ID:** the user's full Gmail address, e.g.
   `alice@gmail.com`. **This is the access key — case-sensitive, no
   trailing whitespace.**

4. Optional fields (helpful for your own bookkeeping, not used by the app):
   - `displayName` (string) — e.g. `Alice`
   - `addedAt` (timestamp) — click the timestamp icon then "Set to now"

5. Click **Save**.

You can add/remove users any time — no redeploy needed. Changes take
effect on the next read (i.e. when the user next loads the app or
their security-rule check re-runs).

## 9. Try it out

1. Open the Hosting URL from step 7 in your browser.
2. Click **Sign in with Google**, choose an allowlisted account.
3. Click the yellow **+** button (bottom-right) to create your first note.
4. Add a title, a few checkboxes, set a reminder, etc.
5. Open the same URL in another browser/tab → sign in as the same user →
   confirm edits sync in real time.
6. Try signing in as a non-allowlisted account → confirm you see
   "Access not approved".

## Local development (optional)

```bash
firebase emulators:start --only hosting
```

Opens at <http://localhost:5000>. Uses the **real** Firestore/Auth (not
emulators), so you can iterate on the UI without redeploying. Your
local-edits live in `public/`.

If you want full local emulation (Firestore + Auth without touching prod
data), run `firebase init emulators` first to set them up — that's
beyond the scope of this guide.

## Troubleshooting

**"Permission denied" when you try to use the app.**
Either the user isn't in `allowedUsers` (check exact email spelling), or
the rules haven't deployed (re-run `firebase deploy --only firestore:rules`).

**Sign-in popup gets blocked.**
Allow popups for your hosting URL in browser settings.

**"This domain is not authorized for OAuth operations."**
Firebase Console → Authentication → Settings → Authorized domains. Add
the domain you're serving from. `localhost` and your `*.web.app`
hosting domain are added by default.

**`firebase deploy` says "no project active".**
You haven't edited `.firebaserc`, or you're not in the repo root. Run
`firebase use --add` and pick your project to fix it interactively.

**You forgot to copy the `firebaseConfig`.**
Firebase Console → gear icon (top-left) → **Project settings** → **General**
tab → scroll to "Your apps" → **SDK setup and configuration** → **Config**.

**Firestore says "the query requires an index".**
Click the link in the error message to auto-create it. This shouldn't
happen with the current code, but might if you add `orderBy` clauses
to the query.
