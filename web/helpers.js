// Word: the helpers. Plain functions of the guesses (and your marks), and of times, so tests can run them in Node.
// Notes are [{ word, count }]; a result is { letter: "in" | "out" }. Repeated letters in a guess count once.

import { BLOCKED, COMMON } from "./common.js";
import { WORDS } from "./words.js";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz";

// --- The dictionary: asked about a word or for a count. Learn words picks from the common ones (common.js). ---

export const WORD_COUNT = WORDS.size;

export function isWord(word) {
  return WORDS.has(word);
}

// The common words that can be picked: all but the blocked ones
const PICKABLE = COMMON.filter((word) => !BLOCKED.has(word));

// Some different common words picked at random (a partial shuffle), for the Learn words view; all of them, shuffled,
// when more are asked for than there are
export function randomWords(count, random = Math.random) {
  const words = [...PICKABLE];
  count = Math.min(count, words.length);
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(random() * (words.length - i));
    [words[i], words[j]] = [words[j], words[i]];
  }
  return words.slice(0, count);
}

// --- Basic helper: a guess that scored 0 has none of its letters in the word. ---

export function zeroGuesses(notes) {
  const known = {};
  for (const { word, count } of notes) {
    if (count === 0) for (const letter of word) known[letter] = "out";
  }
  return known;
}

// --- Advanced helper: try every set of up to 4 letters the secret word could use (about 18,000) and keep the
// ones that give every guess its count. A letter in all of them is green, in none of them red.
// Your green/red marks narrow it down too, but never your mark on the letter itself, so a letter the
// counts settle can't be changed by tapping it. ---

const LETTER_SETS = allSets("", 0);

function allSets(chosen, from) {
  const sets = chosen ? [chosen] : [];
  if (chosen.length === 4) return sets;
  for (let i = from; i < ALPHABET.length; i++) sets.push(...allSets(chosen + ALPHABET[i], i + 1));
  return sets;
}

// The letter sets (like "ackr") that give every guess its count.
// knownLetters then says which letters those sets settle as "in" or "out".
export function fittingSets(notes) {
  return LETTER_SETS.filter((set) =>
    notes.every(({ word, count }) => [...new Set(word)].filter((letter) => set.includes(letter)).length === count),
  );
}

export function knownLetters(fitting, colours) {
  const marks = Object.entries(colours).filter(([, colour]) => colour !== "unsure");
  const known = {};
  for (const letter of ALPHABET) {
    const marked = fitting.filter((set) =>
      marks.every(([other, colour]) => other === letter || set.includes(other) === (colour === "in")),
    );
    const sets = marked.length ? marked : fitting; // if your marks clash with the counts, trust the counts
    if (!sets.length) continue; // the counts contradict each other
    if (sets.every((set) => set.includes(letter))) known[letter] = "in";
    else if (!sets.some((set) => set.includes(letter))) known[letter] = "out";
  }
  return known;
}

// How many dictionary words the secret could still be: those whose letters are a fitting set, minus the ones
// already guessed (a right guess would have ended the game).
export function wordsLeft(fitting, notes) {
  const sets = new Set(fitting);
  const guessed = new Set(notes.map((note) => note.word));
  let count = 0;
  for (const word of WORDS) {
    if (!guessed.has(word) && sets.has([...new Set(word)].sort().join(""))) count++;
  }
  return count;
}

// --- Times: a stretch of time as m:ss, or h:mm:ss past an hour, for the game's timers and the duel's clocks. ---

export function formatTime(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const [h, m, s] = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60];
  const pad = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
