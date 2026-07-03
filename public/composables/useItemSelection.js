import { ref } from "vue";
import { useNotes } from "./useNotes.js";
import { useUndo } from "./useUndo.js";

// Multi-item selection + cut/copy/paste for checklist items (desktop only).
//
// Dragging the mouse from inside an item's text out past its boundary switches
// from native text selection to "item-selection mode": whole items between the
// anchor and the pointer get a light-blue highlight. Ctrl+C/Ctrl+X/Ctrl+V then
// copy/cut/paste them. Items travel through the real system clipboard as a
// Markdown-style task list ("[ ] label" / "[x] label"), so state round-trips and
// it interops with other apps.

const { notes, newItemId, insertItems, deleteItems, restoreItems } = useNotes();
const { pushUndo } = useUndo();

// At most one note holds a selection at a time.
const selection = ref({ noteId: null, ids: [] });

function isSelected(noteId, itemId) {
  return selection.value.noteId === noteId && selection.value.ids.includes(itemId);
}

function setSelection(noteId, ids) {
  selection.value = { noteId, ids };
  syncProxy();
}

function clearSelection() {
  if (!selection.value.noteId && !selection.value.ids.length) return;
  selection.value = { noteId: null, ids: [] };
  if (proxy && document.activeElement === proxy) proxy.blur();
}

// ---- Clipboard text format ----

function formatSelection() {
  const note = notes.value.find(n => n.id === selection.value.noteId);
  if (!note) return "";
  const items = note.items || {};
  return selection.value.ids
    .map(id => items[id])
    .filter(Boolean)
    .map(it => (it.checked ? "[x] " : "[ ] ") + (it.label || ""))
    .join("\n");
}

function parseItems(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue; // skip blank lines
    const m = line.match(/^\s*\[([ xX])\]\s+(.*)$/);
    if (m) out.push({ checked: m[1].toLowerCase() === "x", label: m[2] });
    else out.push({ checked: false, label: line.trim() });
  }
  return out;
}

// ---- Hidden proxy textarea (so copy/cut/paste fire without permission prompts) ----

let proxy = null;

function ensureProxy() {
  if (proxy) return proxy;
  proxy = document.createElement("textarea");
  proxy.setAttribute("aria-hidden", "true");
  proxy.tabIndex = -1;
  // A constant, non-empty value that we keep selected: it guarantees the
  // copy/cut/paste events fire, and because it never changes it doesn't trip
  // useUndo's "textarea edited since focus" guard (so Ctrl+Z still works while
  // the proxy holds focus). The real clipboard text is set in the handlers.
  proxy.value = " ";
  Object.assign(proxy.style, {
    position: "fixed", left: "-9999px", top: "0",
    width: "1px", height: "1px", opacity: "0", padding: "0", border: "0"
  });
  proxy.addEventListener("copy", onProxyCopy);
  proxy.addEventListener("cut", onProxyCut);
  proxy.addEventListener("paste", onProxyPaste);
  document.body.appendChild(proxy);
  return proxy;
}

function focusProxy() {
  const p = ensureProxy();
  if (document.activeElement !== p) p.focus({ preventScroll: true });
}

// Keep the proxy's constant value selected so the copy/cut events reliably fire
// on it. The value itself never changes (see ensureProxy).
function syncProxy() {
  if (!selection.value.ids.length) return;
  ensureProxy().select();
}

function onProxyCopy(e) {
  if (!selection.value.ids.length) return;
  e.clipboardData.setData("text/plain", formatSelection());
  e.preventDefault();
}

function onProxyCut(e) {
  if (!selection.value.ids.length) return;
  e.clipboardData.setData("text/plain", formatSelection());
  e.preventDefault();
  doCut();
}

function onProxyPaste(e) {
  const noteId = selection.value.noteId;
  if (!noteId) return;
  const text = e.clipboardData.getData("text/plain");
  e.preventDefault();
  if (!text) return;
  const note = notes.value.find(n => n.id === noteId);
  if (!note) return;
  const order = note.itemOrder || [];
  const lastId = selection.value.ids[selection.value.ids.length - 1];
  const at = order.indexOf(lastId);
  pasteInto(noteId, text, at === -1 ? order.length : at + 1);
}

// ---- Cut / paste operations ----

function doCut() {
  const noteId = selection.value.noteId;
  const note = notes.value.find(n => n.id === noteId);
  if (!note) return;
  const items = note.items || {};
  const prevOrder = [...(note.itemOrder || [])];
  const saved = selection.value.ids
    .filter(id => items[id])
    .map(id => ({
      id,
      label: items[id].label || "",
      checked: !!items[id].checked,
      checkedAt: items[id].checkedAt
    }));
  if (!saved.length) return;
  const ids = saved.map(s => s.id);
  deleteItems(noteId, ids).catch(err => console.error("cut failed:", err));
  pushUndo("Cut items", () => restoreItems(noteId, saved, prevOrder));
  clearSelection();
}

function pasteInto(noteId, text, insertAt) {
  const parsed = parseItems(text);
  if (!parsed.length) return;
  const newItems = parsed.map(p => ({ id: newItemId(), label: p.label, checked: p.checked }));
  const newIds = newItems.map(it => it.id);

  const note = notes.value.find(n => n.id === noteId);
  const order = note?.itemOrder ? [...note.itemOrder] : [];
  order.splice(insertAt, 0, ...newIds);

  // Optimistic local mutation so the pasted items render in this same task.
  const idx = notes.value.findIndex(n => n.id === noteId);
  if (idx !== -1) {
    const old = notes.value[idx];
    const itemsMap = { ...(old.items || {}) };
    for (const it of newItems) {
      itemsMap[it.id] = it.checked
        ? { label: it.label, checked: true, checkedAt: Date.now() }
        : { label: it.label, checked: false };
    }
    notes.value[idx] = { ...old, items: itemsMap, itemOrder: order };
  }

  insertItems(noteId, newItems, order).catch(err => console.error("paste failed:", err));
  pushUndo("Paste items", () => deleteItems(noteId, newIds));

  // Show what was pasted, and keep the proxy focused so it can be re-copied/cut.
  setSelection(noteId, newIds);
  focusProxy();
}

// ---- Drag-to-select ----

// Visible item <li>s of a note, in visual order (unchecked list then checked).
function itemElsOf(noteEl) {
  return Array.from(noteEl.querySelectorAll("[data-item-id]"));
}

// Index of the item whose vertical span contains (or is nearest below) y.
function itemIndexAtY(els, y) {
  for (let i = 0; i < els.length; i++) {
    if (y < els[i].getBoundingClientRect().bottom) return i;
  }
  return els.length - 1;
}

let drag = null; // { noteId, itemEls, anchorIndex, engaged }

function onMouseDown(e) {
  if (e.button !== 0) return;
  const itemEl = e.target.closest && e.target.closest("[data-item-id]");
  if (!itemEl) {
    clearSelection();
    return;
  }
  // Leave the drag handle, checkbox and delete button to their own behavior.
  if (e.target.closest(".checklist-drag-handle, .checklist-checkbox, .checklist-delete")) {
    return;
  }
  const noteEl = itemEl.closest("[data-note-id]");
  if (!noteEl) return;
  const itemEls = itemElsOf(noteEl);
  const anchorIndex = itemEls.indexOf(itemEl);
  if (anchorIndex === -1) return;
  // A fresh press starts over; native text selection is allowed to begin.
  clearSelection();
  drag = { noteId: noteEl.dataset.noteId, itemEls, anchorIndex, engaged: false };
  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("mouseup", onMouseUp, true);
}

function onMouseMove(e) {
  if (!drag) return;
  const idx = itemIndexAtY(drag.itemEls, e.clientY);
  if (idx === -1) return;
  if (!drag.engaged) {
    if (idx === drag.anchorIndex) return; // still within the anchor item
    drag.engaged = true;
    const sel = window.getSelection();
    if (sel) sel.removeAllRanges();
    if (document.activeElement && typeof document.activeElement.blur === "function") {
      document.activeElement.blur();
    }
  }
  const lo = Math.min(drag.anchorIndex, idx);
  const hi = Math.max(drag.anchorIndex, idx);
  setSelection(drag.noteId, drag.itemEls.slice(lo, hi + 1).map(el => el.dataset.itemId));
  focusProxy();
  e.preventDefault();
}

function onMouseUp() {
  document.removeEventListener("mousemove", onMouseMove, true);
  document.removeEventListener("mouseup", onMouseUp, true);
  if (drag && drag.engaged) focusProxy();
  drag = null;
}

// ---- Editing an item and pasting a multi-line / task-list clipboard ----

function onDocPaste(e) {
  const el = e.target;
  if (!el || el === proxy) return; // proxy paste is handled separately
  if (!el.classList || !el.classList.contains("item-label-input")) return;
  const text = e.clipboardData.getData("text/plain");
  if (!text) return;
  const multiline = /\r?\n/.test(text.trim());
  const hasPrefix = /^\s*\[[ xX]\]\s+/m.test(text);
  if (!multiline && !hasPrefix) return; // normal single-line paste into the item
  const itemEl = el.closest("[data-item-id]");
  const noteEl = el.closest("[data-note-id]");
  if (!itemEl || !noteEl) return;
  e.preventDefault();
  const noteId = noteEl.dataset.noteId;
  const note = notes.value.find(n => n.id === noteId);
  if (!note) return;
  const order = note.itemOrder || [];
  const at = order.indexOf(itemEl.dataset.itemId);
  pasteInto(noteId, text, at === -1 ? order.length : at + 1);
}

function onKeyDown(e) {
  if (e.key === "Escape" && selection.value.ids.length) clearSelection();
}

let initialized = false;
function init() {
  if (initialized) return;
  initialized = true;
  document.addEventListener("mousedown", onMouseDown, true);
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("paste", onDocPaste, true);
}

export function useItemSelection() {
  init();
  return { isSelected, clearSelection };
}
