// Prints what the advanced helper shows after each guess of a game (with the letters it found, once one set is left),
// and the score the page gives the guess:
// node helper_steps.mjs <game.json>
// The game's word is 4 or 5 letters long. Its optional `colours` ({ letter: "in" | "out" | "unsure" }) are your marks,
// the same at every guess.
import { readFileSync } from "node:fs";
import { fittingSets, knownLetters, lettersOf, score, wordsLeft } from "../web/helpers.js";

const notes = [];
const { secret, guesses, colours = {} } = JSON.parse(readFileSync(process.argv[2], "utf8"));
const letters = (known, which) => Object.keys(known).filter((letter) => known[letter] === which).sort().join("");
const steps = guesses.map(({ word, count }) => {
  notes.push({ word, count });
  const fitting = fittingSets(notes, secret.length);
  const known = knownLetters(fitting, colours);
  return {
    word,
    score: score(word, secret),
    green: letters(known, "in"),
    red: letters(known, "out"),
    letterSetsLeft: fitting.length,
    found: fitting.length === 1 ? lettersOf(fitting[0]) : "",
    wordsLeft: wordsLeft(fitting, notes, secret.length),
  };
});
console.log(JSON.stringify(steps));
