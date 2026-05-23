import { ref } from "vue";
import JSZip from "jszip";
import { collection, addDoc, Timestamp } from "firebase/firestore";
import { db } from "../firebase-init.js";
import { useAuth } from "./useAuth.js";
import { useNotes } from "./useNotes.js";

const { currentUser } = useAuth();
const { notes: existingNotes } = useNotes();
const dialogOpen = ref(false);
const CONFIRM_THRESHOLD = 200;
let pendingAllNotes = null;
let pendingDocs = null;

const state = ref(freshState());

function freshState() {
  return {
    active: false,
    phase: "idle",
    fileName: "",
    totalKeepFiles: 0,
    processed: 0,
    skipped: 0,
    oldRecurrences: 0,
    remindersMatched: 0,
    imported: 0,
    failed: 0,
    toImport: 0,
    filterCounts: { reminders: 0, labels: 0, labelsOrReminders: 0, everything: 0 },
    errorMessage: "",
    unsupportedFeatures: new Set()
  };
}

function reset() {
  pendingAllNotes = null;
  pendingDocs = null;
  state.value = freshState();
}

function showDialog() { reset(); dialogOpen.value = true; }
function closeDialog() { dialogOpen.value = false; }

function normalizeTitle(t) {
  return (t || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function beforeDash(t) {
  const idx = t.indexOf(" - ");
  return idx !== -1 ? t.substring(0, idx).trim() : t;
}

function genItemId() {
  if (window.crypto?.randomUUID) {
    return "item_" + window.crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  }
  return "item_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function nextOccurrenceAfter(reference, recurrence, template) {
  if (!template) return null;
  if (recurrence === "daily") {
    const next = new Date(reference);
    next.setHours(template.getHours(), template.getMinutes(), 0, 0);
    while (next <= reference) next.setDate(next.getDate() + 1);
    return next;
  }
  if (recurrence === "weekly") {
    const next = new Date(reference);
    next.setHours(template.getHours(), template.getMinutes(), 0, 0);
    const targetDay = template.getDay();
    while (next.getDay() !== targetDay || next <= reference) {
      next.setDate(next.getDate() + 1);
    }
    return next;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Parse Google Tasks (Takeout/Tasks/Tasks.json)
//
// Returns Map<normalizedTitle, {reminderAt: Timestamp, reminderRecurrence: string}>
// ---------------------------------------------------------------------------
function parseTasksReminders(tasksJson, unsupportedFeatures) {
  const reminderMap = new Map();
  if (!tasksJson || !Array.isArray(tasksJson.items)) return reminderMap;

  const now = new Date();

  const recById = new Map();
  for (const tl of tasksJson.items) {
    for (const rec of tl.recurrences || []) {
      recById.set(rec.id, rec);
    }
  }

  // 1. Recurring reminders.
  // For each recurrence, find the best item to extract scheduled_time from:
  //   - Prefer a needsAction item (the next upcoming instance).
  //   - Fall back to the most recent completed item (to get the time of day).
  // Many recurrences have ALL instances completed — skipping those would miss
  // most recurring reminders.
  const recBestItem = new Map(); // recurrence_id -> { start, title }

  for (const tl of tasksJson.items) {
    for (const item of tl.items || []) {
      const rid = item.task_recurrence_id;
      if (!rid) continue;
      const sched = (item.scheduled_time || []).find(s => s.current);
      if (!sched) continue;
      const existing = recBestItem.get(rid);
      const isNA = item.status === "needsAction";
      const existingIsNA = existing?.isNeedsAction;
      // Prefer needsAction over completed; within same status, prefer most recent.
      if (!existing ||
          (isNA && !existingIsNA) ||
          (isNA === existingIsNA && sched.start > existing.start)) {
        recBestItem.set(rid, {
          start: sched.start,
          title: item.title || "",
          isNeedsAction: isNA
        });
      }
    }
  }

  for (const [rid, best] of recBestItem) {
    const rec = recById.get(rid);
    if (!rec) continue;
    const interval = rec.schedule?.interval || {};
    let freq = "none";
    if (interval.daily) freq = "daily";
    else if (interval.weekly) freq = "weekly";

    if ((interval.interval_multiplier || 1) > 1) {
      unsupportedFeatures.add("bi-weekly or other interval multipliers");
    }
    if (freq === "weekly") {
      const days = interval.weekly?.day_of_week || [];
      if (days.length > 1) {
        unsupportedFeatures.add("multi-day weekly recurrences (only first day imported)");
      }
    }

    const template = new Date(best.start);
    if (isNaN(template.getTime())) continue;

    let reminderAt;
    if (freq === "daily" || freq === "weekly") {
      const next = nextOccurrenceAfter(now, freq, template);
      if (!next) continue;
      reminderAt = Timestamp.fromDate(next);
    } else {
      if (template <= now) continue;
      reminderAt = Timestamp.fromDate(template);
    }

    // Use the recurrence's own title (which is the full template) as well as
    // the item title for matching. The recurrence title is often more complete.
    const keyFromItem = normalizeTitle(beforeDash(best.title));
    const keyFromRec = normalizeTitle(beforeDash(rec.title || ""));
    const entry = { reminderAt, reminderRecurrence: freq };

    if (keyFromItem && !reminderMap.has(keyFromItem)) {
      reminderMap.set(keyFromItem, entry);
    }
    if (keyFromRec && keyFromRec !== keyFromItem && !reminderMap.has(keyFromRec)) {
      reminderMap.set(keyFromRec, entry);
    }
  }

  // 2. One-shot reminders: needsAction, no recurrence, future scheduled_time.
  for (const tl of tasksJson.items) {
    for (const item of tl.items || []) {
      if (item.task_recurrence_id || item.status !== "needsAction") continue;
      const sched = (item.scheduled_time || []).find(s => s.current);
      if (!sched) continue;
      const dt = new Date(sched.start);
      if (isNaN(dt.getTime()) || dt <= now) continue;
      const key = normalizeTitle(beforeDash(item.title || ""));
      if (key && !reminderMap.has(key)) {
        reminderMap.set(key, {
          reminderAt: Timestamp.fromDate(dt),
          reminderRecurrence: "none"
        });
      }
    }
  }

  return reminderMap;
}

// Try to find a reminder for a Keep note by its normalized title.
function matchReminder(keepNormTitle, reminderMap) {
  if (!keepNormTitle) return null;
  if (reminderMap.has(keepNormTitle)) return reminderMap.get(keepNormTitle);
  for (const [rt, info] of reminderMap) {
    if (rt.startsWith(keepNormTitle + " ") || keepNormTitle.startsWith(rt + " ") ||
        rt.startsWith(keepNormTitle + " -") || keepNormTitle.startsWith(rt + " -")) {
      return info;
    }
  }
  return null;
}

// Convert a Keep note to a Ribuim note doc, optionally with reminder info.
function keepNoteToRibuim(keepNote, ownerEmail, reminderInfo, unsupported) {
  if (keepNote.attachments?.length) unsupported.add("attachments");
  if (keepNote.annotations?.length) unsupported.add("annotations");
  if (keepNote.sharees?.length) unsupported.add("shared notes");
  if (keepNote.color && keepNote.color !== "DEFAULT") unsupported.add("note colors");

  let createdAt;
  if (typeof keepNote.createdTimestampUsec === "number") {
    createdAt = Timestamp.fromMillis(keepNote.createdTimestampUsec / 1000);
  } else {
    createdAt = Timestamp.now();
  }

  const items = {};
  const itemOrder = [];
  if (Array.isArray(keepNote.listContent) && keepNote.listContent.length) {
    for (const entry of keepNote.listContent) {
      const text = (entry && typeof entry.text === "string") ? entry.text : "";
      const checked = !!(entry && entry.isChecked);
      const id = genItemId();
      items[id] = { label: text, checked };
      itemOrder.push(id);
    }
  } else if (typeof keepNote.textContent === "string" && keepNote.textContent.trim()) {
    for (const line of keepNote.textContent.split(/\r?\n/).map(l => l.trim()).filter(l => l)) {
      const id = genItemId();
      items[id] = { label: line, checked: false };
      itemOrder.push(id);
    }
  }

  const labels = [];
  if (Array.isArray(keepNote.labels)) {
    for (const l of keepNote.labels) {
      if (l?.name?.trim()) labels.push(l.name.trim());
    }
  }

  return {
    ownerEmail,
    title: (typeof keepNote.title === "string") ? keepNote.title : "",
    createdAt,
    reminderAt: reminderInfo?.reminderAt || null,
    reminderRecurrence: reminderInfo?.reminderRecurrence || "none",
    reminderDone: false,
    items,
    itemOrder,
    labels
  };
}

// ---------------------------------------------------------------------------
// Main import flow
// ---------------------------------------------------------------------------

async function importFromFile(file) {
  reset();
  state.value.active = true;
  state.value.phase = "reading";
  state.value.fileName = file.name;

  const email = currentUser.value?.email;
  if (!email) {
    state.value.phase = "error";
    state.value.errorMessage = "You must be signed in to import.";
    return;
  }

  let zip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch (err) {
    state.value.phase = "error";
    state.value.errorMessage = "Could not open the zip file: " + (err.message || err);
    return;
  }

  // ---- Parse Tasks.json (if present) for reminder info ----
  let reminderMap = new Map();
  const tasksEntry = zip.file(/Tasks\/Tasks\.json$/i)[0];
  if (tasksEntry) {
    try {
      const tasksText = await tasksEntry.async("string");
      const tasksJson = JSON.parse(tasksText);
      reminderMap = parseTasksReminders(tasksJson, state.value.unsupportedFeatures);
    } catch (err) {
      console.warn("Failed to parse Tasks.json:", err);
    }
  }

  // ---- Parse Keep JSON files ----
  const jsonEntries = [];
  zip.forEach((relPath, entry) => {
    if (entry.dir) return;
    if (!/\/Keep\/.+\.json$/i.test(relPath)) return;
    jsonEntries.push(entry);
  });

  if (!jsonEntries.length) {
    state.value.phase = "error";
    state.value.errorMessage = "No Google Keep notes found in this archive.";
    return;
  }

  state.value.totalKeepFiles = jsonEntries.length;
  state.value.phase = "parsing";

  const rawNotes = [];
  for (const entry of jsonEntries) {
    try {
      const text = await entry.async("string");
      const keepNote = JSON.parse(text);
      if (keepNote.isTrashed || keepNote.isArchived) {
        state.value.skipped++;
      } else {
        rawNotes.push(keepNote);
      }
    } catch (err) {
      state.value.failed++;
    }
    state.value.processed++;
  }

  // ---- Dedup by normalized title ----
  const byTitle = new Map();
  const emptyTitled = [];
  for (const n of rawNotes) {
    const norm = normalizeTitle(n.title);
    if (!norm) { emptyTitled.push(n); continue; }
    const existing = byTitle.get(norm);
    if (!existing) {
      byTitle.set(norm, n);
    } else {
      state.value.oldRecurrences++;
      if ((n.createdTimestampUsec || 0) > (existing.createdTimestampUsec || 0)) {
        byTitle.set(norm, n);
      }
    }
  }

  // ---- Convert + match reminders ----
  const allNotes = []; // { doc, hasReminder, hasLabels }
  for (const [norm, keepNote] of byTitle) {
    const rem = matchReminder(norm, reminderMap);
    if (rem) state.value.remindersMatched++;
    const doc = keepNoteToRibuim(keepNote, email, rem, state.value.unsupportedFeatures);
    allNotes.push({
      doc,
      hasReminder: !!(rem && doc.reminderAt),
      hasLabels: doc.labels.length > 0
    });
  }
  for (const keepNote of emptyTitled) {
    const doc = keepNoteToRibuim(keepNote, email, null, state.value.unsupportedFeatures);
    allNotes.push({ doc, hasReminder: false, hasLabels: doc.labels.length > 0 });
  }

  // ---- Compute filter counts ----
  // Build a set of normalized titles already in Firestore so we can offer
  // a "missing only" filter for re-imports after a bugfix.
  const existingTitleSet = new Set();
  for (const n of existingNotes.value) {
    const norm = normalizeTitle(n.title);
    if (norm) existingTitleSet.add(norm);
  }

  let cRem = 0, cLab = 0, cOr = 0, cMissing = 0;
  for (const n of allNotes) {
    if (n.hasReminder) cRem++;
    if (n.hasLabels) cLab++;
    if (n.hasReminder || n.hasLabels) cOr++;
    const norm = normalizeTitle(n.doc.title);
    n.isMissing = n.hasReminder && (!norm || !existingTitleSet.has(norm));
    if (n.isMissing) cMissing++;
  }
  state.value.filterCounts = {
    reminders: cRem,
    labels: cLab,
    labelsOrReminders: cOr,
    missingReminders: cMissing,
    everything: allNotes.length
  };

  pendingAllNotes = allNotes;
  state.value.phase = "filter_select";
}

function applyFilter(filterType) {
  if (!pendingAllNotes) return;
  const filtered = pendingAllNotes.filter(n => {
    switch (filterType) {
      case "reminders": return n.hasReminder;
      case "labels": return n.hasLabels;
      case "labels_or_reminders": return n.hasReminder || n.hasLabels;
      case "missing_reminders": return n.isMissing;
      default: return true;
    }
  });
  const docs = filtered.map(n => n.doc);
  pendingAllNotes = null;
  state.value.toImport = docs.length;

  if (docs.length > CONFIRM_THRESHOLD) {
    pendingDocs = docs;
    state.value.phase = "confirming";
    return;
  }
  if (docs.length === 0) {
    state.value.phase = "done";
    return;
  }
  writeDocs(docs);
}

async function writeDocs(docs) {
  state.value.phase = "writing";
  state.value.toImport = docs.length;
  const notesCol = collection(db, "notes");
  const CONCURRENCY = 16;
  let cursor = 0;

  async function worker() {
    while (cursor < docs.length) {
      const idx = cursor++;
      try {
        await addDoc(notesCol, docs[idx]);
        state.value.imported++;
      } catch (err) {
        console.warn("Failed to write note:", err);
        state.value.failed++;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, docs.length) }, () => worker())
  );
  state.value.phase = "done";
}

async function confirmPending() {
  if (!pendingDocs) return;
  const docs = pendingDocs;
  pendingDocs = null;
  await writeDocs(docs);
}

function cancelPending() {
  pendingDocs = null;
  pendingAllNotes = null;
  state.value.phase = "idle";
  state.value.active = false;
}

export function useImport() {
  return {
    state, dialogOpen,
    importFromFile, applyFilter, confirmPending, cancelPending,
    reset, showDialog, closeDialog
  };
}
