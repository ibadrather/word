// Prints what the advanced helper shows after each guess of a game: node helper_steps.mjs <game.json>
import { readFileSync } from "node:fs";
import { fittingSets, letterSets } from "../src/word/static/helpers.js";

const notes = [];
const steps = JSON.parse(readFileSync(process.argv[2], "utf8")).guesses.map(({ word, count }) => {
  notes.push({ word, count });
  const fitting = fittingSets(notes);
  const known = letterSets(fitting, {});
  const green = Object.keys(known).filter((letter) => known[letter] === "in").sort().join("");
  return { word, green, letterSetsLeft: fitting.length };
});
console.log(JSON.stringify(steps));
