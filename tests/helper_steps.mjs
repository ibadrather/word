// Prints what the advanced helper shows after each guess of a game, and the score the page gives the guess:
// node helper_steps.mjs <game.json>
import { readFileSync } from "node:fs";
import { fittingSets, knownLetters, score, wordsLeft } from "../web/helpers.js";

const notes = [];
const { secret, guesses } = JSON.parse(readFileSync(process.argv[2], "utf8"));
const steps = guesses.map(({ word, count }) => {
  notes.push({ word, count });
  const fitting = fittingSets(notes);
  const known = knownLetters(fitting, {});
  const green = Object.keys(known).filter((letter) => known[letter] === "in").sort().join("");
  return { word, score: score(word, secret), green, letterSetsLeft: fitting.length, wordsLeft: wordsLeft(fitting, notes) };
});
console.log(JSON.stringify(steps));
