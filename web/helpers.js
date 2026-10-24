// Word: the helpers. Plain functions of the guesses (and your marks), and of times, so tests can run them in Node.
// Notes are [{ word, count }]; a result is { letter: "in" | "out" }. Repeated letters in a guess count once.

import * as common4 from "./common.js";
import * as common5 from "./common5.js";
import { WORDS } from "./words.js";
import { WORDS as WORDS5 } from "./words5.js";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz";

// --- The dictionaries, of 4 letters (words.js) and of 5 (words5.js, for the group game): asked about a word or for a
//     count. Learn words and the group game pick from the common ones (common.js, common5.js). ---

const DICTIONARIES = { 4: WORDS, 5: WORDS5 };
export const WORD_COUNT = WORDS.size;
export const WORD_COUNT_5 = WORDS5.size;

// A word of either length
export function isWord(word) {
  return DICTIONARIES[word.length]?.has(word) ?? false;
}

// The common words that can be picked, by length: all but the blocked ones
const pickable = ({ COMMON, BLOCKED }) => COMMON.filter((word) => !BLOCKED.has(word));
const PICKABLE = { 4: pickable(common4), 5: pickable(common5) };

// Some different common words of `letters` letters picked at random (a partial shuffle), for the Learn words view and
// the group game's deal; all of them, shuffled, when more are asked for than there are
export function randomWords(count, random = Math.random, letters = 4) {
  const words = [...PICKABLE[letters]];
  const picks = Math.min(count, words.length);
  for (let i = 0; i < picks; i++) {
    const j = i + Math.floor(random() * (words.length - i));
    [words[i], words[j]] = [words[j], words[i]];
  }
  return words.slice(0, picks);
}

// The common words' brief meanings (meanings.js): { word: meaning }. It's big, so it loads the first time it's asked
// for (Learn words, the end of a group game); {} if it can't, and it's tried again next time.
let meanings;
export function loadMeanings() {
  meanings ??= import("./meanings.js").then(
    ({ MEANINGS }) => MEANINGS,
    () => {
      meanings = undefined;
      return {};
    },
  );
  return meanings;
}

// --- Scoring: how many of a guess's letters are in the word. ---

export const score = (guess, word) => [...new Set(guess)].filter((letter) => word.includes(letter)).length;

// --- Basic helper: a guess that scored 0 has none of its letters in the word. ---

export function zeroGuesses(notes) {
  const known = {};
  for (const { word, count } of notes) {
    if (count === 0) for (const letter of word) known[letter] = "out";
  }
  return known;
}

// --- Advanced helper: try every set of up to 4 letters the secret word could use (about 18,000), or up to 5 for a
// 5-letter word (about 84,000), and keep the ones that give every guess its count. A letter in all of them is green,
// in none of them red. Your green/red marks narrow it down too, but never your mark on the letter itself, so a letter
// the counts settle can't be changed by tapping it. A set is a bitmask, a bit a letter (a is 1, b 2, c 4…), so a
// guess's score against it is the bits they share. ---

const bit = (letter) => 1 << ALPHABET.indexOf(letter);
const maskOf = (word) => [...word].reduce((mask, letter) => mask | bit(letter), 0);

// A set's letters in order, like "ackr"
export const lettersOf = (set) => [...ALPHABET].filter((letter) => set & bit(letter)).join("");

function bitCount(mask) {
  let count = 0;
  for (let rest = mask; rest; rest &= rest - 1) count++;
  return count;
}

// Every set of 1 to `size` letters, made the first time a length asks for them
const LETTER_SETS = {};
function letterSets(size) {
  if (LETTER_SETS[size]) return LETTER_SETS[size];
  const sets = [];
  const add = (mask, from, left) => {
    for (let i = from; i < ALPHABET.length; i++) {
      sets.push(mask | (1 << i));
      if (left > 1) add(mask | (1 << i), i + 1, left - 1);
    }
  };
  add(0, 0, size);
  return (LETTER_SETS[size] = sets);
}

// The letter sets that give every guess of a `letters`-letter game its count (letterSetsLeft in the tests is how
// many). knownLetters then says which letters those sets settle as "in" or "out".
export function fittingSets(notes, letters = 4) {
  let sets = letterSets(letters);
  for (const { word, count } of notes) {
    const guess = maskOf(word);
    sets = sets.filter((set) => bitCount(set & guess) === count);
  }
  return sets;
}

export function knownLetters(fitting, colours) {
  const marks = Object.entries(colours)
    .filter(([letter, colour]) => ALPHABET.includes(letter) && letter.length === 1 && colour !== "unsure")
    .map(([letter, colour]) => ({ letter, mask: bit(letter), in: colour === "in" }));
  const fits = (set, skipped) => marks.every((mark) => mark.letter === skipped || Boolean(set & mark.mask) === mark.in);
  const allMarked = fitting.filter((set) => fits(set, "")); // for a letter without a mark of its own
  const known = {};
  for (const letter of ALPHABET) {
    const own = marks.some((mark) => mark.letter === letter);
    const marked = own ? fitting.filter((set) => fits(set, letter)) : allMarked;
    const sets = marked.length ? marked : fitting; // if your marks clash with the counts, trust the counts
    if (!sets.length) continue; // the counts contradict each other
    const mask = bit(letter);
    if (sets.every((set) => set & mask)) known[letter] = "in";
    else if (!sets.some((set) => set & mask)) known[letter] = "out";
  }
  return known;
}

// Each dictionary word of a length with its letters' mask, made the first time it's asked for
const WORD_MASKS = {};
const wordMasks = (letters) => (WORD_MASKS[letters] ??= [...DICTIONARIES[letters]].map((word) => [word, maskOf(word)]));

// How many dictionary words of `letters` letters the secret could still be: those whose letters are a fitting set,
// minus the ones already guessed (a right guess would have ended the game).
export function wordsLeft(fitting, notes, letters = 4) {
  const sets = new Set(fitting);
  const guessed = new Set(notes.map((note) => note.word));
  let count = 0;
  for (const [word, mask] of wordMasks(letters)) {
    if (!guessed.has(word) && sets.has(mask)) count++;
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
