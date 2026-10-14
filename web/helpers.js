// Word: the helpers. Plain functions of the guesses (and your marks), so tests can run them in Node.
// Notes are [{ word, count }]; a result is { letter: "in" | "out" }. Repeated letters in a guess count once.

const ALPHABET = "abcdefghijklmnopqrstuvwxyz";

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
