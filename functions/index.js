const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

exports.sendReminderNotifications = onSchedule("every 1 minutes", async () => {
  const db = getFirestore();
  const now = Timestamp.now();

  const snapshot = await db
    .collection("notes")
    .where("reminderDone", "==", false)
    .where("reminderAt", "<=", now)
    .get();

  const dueDocs = snapshot.docs.filter(
    (d) => !d.data().notificationSent && !d.data().reminderDismissed && !d.data().trashedAt
  );

  if (!dueDocs.length) return;

  for (const noteDoc of dueDocs) {
    const note = noteDoc.data();

    const tokensSnap = await db
      .collection("fcmTokens")
      .where("ownerEmail", "==", note.ownerEmail)
      .get();

    const tokens = tokensSnap.docs
      .map((d) => d.data().token)
      .filter(Boolean);

    if (tokens.length > 0) {
      const message = {
        tokens,
        data: {
          noteId: noteDoc.id,
          title: "Ribuim Reminder",
          body: note.title || "A reminder needs your attention",
        },
        webpush: {
          fcmOptions: {
            link: `https://ribuim.web.app`,
          },
        },
      };

      try {
        const response = await getMessaging().sendEachForMulticast(message);

        // Remove stale tokens that failed permanently
        response.responses.forEach((resp, idx) => {
          if (
            resp.error &&
            (resp.error.code === "messaging/invalid-registration-token" ||
              resp.error.code ===
                "messaging/registration-token-not-registered")
          ) {
            const staleToken = tokens[idx];
            const staleDoc = tokensSnap.docs.find(
              (d) => d.data().token === staleToken
            );
            if (staleDoc) staleDoc.ref.delete();
          }
        });
      } catch (err) {
        console.error("FCM send failed for note", noteDoc.id, err);
      }
    }

    await noteDoc.ref.update({ notificationSent: true });
  }
});

exports.cleanupTrash = onSchedule("every 168 hours", async () => {
  const db = getFirestore();
  const thirtyDaysAgo = Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const snapshot = await db
    .collection("notes")
    .where("trashedAt", "<=", thirtyDaysAgo)
    .get();

  if (!snapshot.size) return;

  const batch = db.batch();
  snapshot.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();

  console.log(`Deleted ${snapshot.size} trash notes older than 30 days`);
});
