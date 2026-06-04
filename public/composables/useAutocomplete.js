import { computed } from "vue";
import { useNotes } from "./useNotes.js";

const { notes } = useNotes();

// A "pattern" is a multi-word phrase that recurs across the user's notes,
// appearing anywhere within a title or item label (not only at the start).
// We count every contiguous word n-gram (2..MAX_WORDS words) of each string,
// counting a given phrase at most once per source string, and keep phrases
// seen at least MIN_COUNT times. Completion then matches the trailing words
// of what's been typed, so a phrase like "אחרי הצהריים" can be suggested
// mid-item ("חמישי אחרי" -> "הצהריים").
const MIN_COUNT = 2;
const MIN_QUERY = 2;
const MAX_WORDS = 8;
const MAX_WORDS_PER_STRING = 40;

function normalize(s) {
  return (s || "").trim().replace(/\s+/g, " ");
}

const candidates = computed(() => {
  const counts = new Map();
  const addPhrases = (s) => {
    const t = normalize(s);
    if (!t) return;
    const words = t.split(" ").slice(0, MAX_WORDS_PER_STRING);
    const seen = new Set();
    for (let i = 0; i < words.length; i++) {
      let phrase = words[i];
      for (let len = 1; len < MAX_WORDS && i + len < words.length; len++) {
        phrase += " " + words[i + len];
        if (!seen.has(phrase)) {
          seen.add(phrase);
          counts.set(phrase, (counts.get(phrase) || 0) + 1);
        }
      }
    }
  };
  for (const note of notes.value) {
    if (note.trashedAt) continue;
    addPhrases(note.title);
    const items = note.items || {};
    for (const id of Object.keys(items)) {
      addPhrases(items[id]?.label);
    }
  }
  const list = [];
  for (const [text, count] of counts) {
    if (count < MIN_COUNT) continue;
    list.push({ text, count });
  }
  // Most frequent first; on ties prefer the longer phrase.
  list.sort((a, b) => b.count - a.count || b.text.length - a.text.length);
  return list;
});

// Trailing substrings of `text` that begin at a word boundary, longest
// (most context) first. "חמישי אחרי" -> ["חמישי אחרי", "אחרי"].
function trailingQueries(text) {
  const starts = [];
  let inSpace = true;
  for (let i = 0; i < text.length; i++) {
    const isSpace = /\s/.test(text[i]);
    if (!isSpace && inSpace) starts.push(i);
    inSpace = isSpace;
  }
  return starts.map(s => text.slice(s));
}

// Given the text typed so far (cursor at end), return the gray completion
// suffix, or "" if there's no good suggestion. Tries the longest trailing
// phrase first so the most specific recurring pattern wins.
function complete(text) {
  const full = text || "";
  if (!full.trim()) return "";
  for (const q of trailingQueries(full)) {
    if (q.length < MIN_QUERY) continue;
    const ql = q.toLowerCase();
    for (const c of candidates.value) {
      if (c.text.length > q.length && c.text.toLowerCase().startsWith(ql)) {
        return c.text.slice(q.length);
      }
    }
  }
  return "";
}

export function useAutocomplete() {
  return { complete, candidates };
}

