// Word: notes, a keyboard to type guesses on, and letters you mark by colour. Everything stays in this browser.

import { WORD_COUNT, fittingSets, formatTime, isWord, knownLetters, wordsLeft, zeroGuesses } from "./helpers.js";
import * as mode from "./clock.js"; // the duel clock's logic and room
import * as duel from "./duel.js"; // the duel clock's screens: the dock, the sheet and the menu's choice

const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const NEXT_COLOUR = { "": "out", out: "unsure", unsure: "in", in: "" }; // grey → red → yellow → green: most letters are red
const STORAGE_KEY = "guess-word-v2"; // old name kept so saved games survive the rename

const NOT_A_WORD = "Not in the dictionary";
const LOGO = ["unsure", "out", "", "in"]; // the W O R D tiles' colours

const $ = (id) => document.getElementById(id);
const BACKSPACE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 5H9l-6 7 6 7h12z"/><path d="M17 9l-5 6M12 9l5 6"/></svg>';

// --- State: { notes: [{ word, count, at }] oldest first, at being ms into the game (none before the first New game), colours: { letter: "in" | "out" | "unsure" }, secret: my word,
//              helper: "" | "basic" | "advanced", how much to work out from the counts,
//              startedAt: when New game was last pressed, in ms, or null before the first one } ---

let state = load();
let settled = {}; // what the helper settled at the last render: { letter: "in" | "out" }
let guess = ""; // the guess being typed on the page's keyboard, up to 4 letters

function load() {
  const empty = { notes: [], colours: {}, secret: "", helper: "", startedAt: null };
  try {
    return { ...empty, ...JSON.parse(localStorage.getItem(STORAGE_KEY)) };
  } catch {
    return empty;
  }
}

function update(change) {
  change();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
  render();
}

// --- Actions ---

// The page's keyboard only types: any key, whatever its colour. Colours are set from the guess list's tiles.
function type(letter) {
  if (guess.length < 4) setGuess(guess + letter);
}

function backspace() {
  setGuess(guess.slice(0, -1));
}

function setGuess(word) {
  guess = word;
  showMessage(guess.length === 4 && !isWord(guess) ? NOT_A_WORD : ""); // a warning only: you can still note it
  showGuess();
}

function cycleColour(letter) {
  if (settled[letter]) return; // the helper has settled this letter, so it stays put
  update(() => {
    const next = NEXT_COLOUR[state.colours[letter] || ""];
    if (next) state.colours[letter] = next;
    else delete state.colours[letter];
  });
}

// Only your own marks: letters a helper set stay, as they come from the scores
function clearColours() {
  if (confirm("Clear the key colours you set?")) update(() => (state.colours = {}));
}

function addNote(count) {
  const word = guess;
  if (word.length !== 4) return showMessage("Type a 4-letter word first");
  if (state.notes.some((note) => note.word === word)) return showMessage("Already noted");

  setGuess("");
  const at = state.startedAt ? Date.now() - state.startedAt : undefined;
  update(() => {
    state.notes.push({ word, count, at });
    mode.press(); // in a duel, my clock stops and the other player's starts
  });
}

function deleteNote(note) {
  if (confirm(`Remove ${note.word.toUpperCase()} (scored ${note.count})?`)) {
    update(() => (state.notes = state.notes.filter((n) => n !== note)));
  }
}

function newGame() {
  if (confirm("Clear your word, guesses and key colours?")) {
    showSecret(false);
    update(() => {
      state = { notes: [], colours: {}, secret: "", helper: state.helper, startedAt: Date.now() };
      mode.newGame(); // in a duel, both clocks back to full too
    });
  }
}

function showSecret(show) {
  $("secret").type = show ? "text" : "password";
  $("reveal").textContent = show ? "Hide" : "Show";
}

const HELPER_QUESTIONS = {
  "": "Switch to Normal Mode? You mark every letter yourself.",
  basic: "Switch to Basic Helper Mode? Letters from guesses that scored 0 turn red. Letters it sets get a dot and are locked.",
  advanced:
    "Switch to Advanced Helper Mode (dark)? It works out letters from every score. Letters it sets get a dot and are locked.",
};

function chooseHelper(helper) {
  if (confirm(HELPER_QUESTIONS[helper])) update(() => (state.helper = helper));
  else render(); // put the dropdown back
}

// What the chosen helper has settled ({ letter: "in" | "out" }), and for the advanced one the letter sets that fit.
function deduce() {
  if (state.helper === "basic") return { known: zeroGuesses(state.notes) };
  if (state.helper === "advanced") {
    const fitting = fittingSets(state.notes);
    return { known: knownLetters(fitting, state.colours), fitting };
  }
  return { known: {} };
}

const plural = (count, noun) => `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`;

// The advanced helper's progress line. It counts the words left but never shows one.
function progress(fitting) {
  if (!state.notes.length) return `${plural(WORD_COUNT, "word")} to start. Every score you note narrows them down.`;
  if (!fitting.length) return "No letters fit all these scores. Check them for a mistake.";
  const words = plural(wordsLeft(fitting, state.notes), "possible word");
  if (fitting.length === 1) return `Letters found: ${[...fitting[0].toUpperCase()].join(" ")}. ${words} left!`;
  return `${words}, ${plural(fitting.length, "letter set")} left`;
}

// On top, the time since your last guess (since New game before the first one); the game time sits by "Your guesses".
// In a duel the two players' clocks tick in the dock at the bottom (duel.js); the game's own times stay as they are.
function showTimer() {
  $("timer").hidden = $("game-stats").hidden = !state.startedAt;
  if (!state.startedAt) return;
  const elapsed = Date.now() - state.startedAt;
  $("timer").textContent = formatTime(elapsed - (state.notes.at(-1)?.at ?? 0));
  $("game-time").textContent = formatTime(elapsed);
}

function showMessage(text) {
  $("msg").textContent = text;
}

// The guess in its four slots, the next one to fill underlined; the scores light up once it's full
function showGuess() {
  for (const [i, slot] of [...$("word").children].entries()) {
    slot.textContent = guess[i] ?? "";
    slot.classList.toggle("next", i === guess.length);
  }
  $("word").ariaLabel = guess ? `Your guess: ${guess.toUpperCase()}` : "Your guess";
  $("counts").classList.toggle("ready", guess.length === 4);
}

// --- Rendering ---

function button(text, className, onPress) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = className;
  el.textContent = text;
  el.addEventListener("click", onPress);
  return el;
}

// A letter in the guess list: tapping it cycles its colour
function letterButton(letter, className) {
  const el = button(letter, className, () => cycleColour(letter));
  el.dataset.letter = letter;
  return el;
}

function buildControls() {
  for (const [i, letters] of ROWS.entries()) {
    const row = document.createElement("div");
    row.className = "row";
    for (const letter of letters) {
      const key = button(letter, "key", () => type(letter));
      key.dataset.letter = letter;
      row.append(key);
    }
    if (i === ROWS.length - 1) {
      const back = button("", "key back", backspace);
      back.innerHTML = BACKSPACE_ICON;
      back.ariaLabel = "Delete letter";
      row.append(back);
    }
    $("keyboard").append(row);
  }
  for (let count = 0; count <= 4; count++) {
    $("counts").append(button(count, "", () => addNote(count)));
  }
  // A computer's own keyboard types too, unless you're typing in a box or a dialog is open
  document.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || document.querySelector("dialog[open]")) return;
    if (event.target.closest("input, select, textarea")) return;
    if (/^[a-z]$/i.test(event.key)) type(event.key.toLowerCase());
    else if (event.key === "Backspace") backspace();
    else return;
    event.preventDefault();
  });
  $("secret").addEventListener("input", (event) => {
    event.target.value = event.target.value.replace(/[^a-z]/gi, "").slice(0, 4);
    update(() => (state.secret = event.target.value.toLowerCase()));
  });
  $("reveal").addEventListener("click", () => showSecret($("secret").type === "password"));
  $("reset").addEventListener("click", newGame);
  $("clear").addEventListener("click", clearColours);
  $("logo").addEventListener("click", () => $("menu").showModal());
  $("close").addEventListener("click", () => $("menu").close());
  $("menu").addEventListener("click", (event) => {
    if (event.target === $("menu")) $("menu").close(); // a tap on the dimmed page outside the drawer
  });
  $("helper").addEventListener("change", (event) => chooseHelper(event.target.value));
  // The dictionary's size as tiles in the logo's colours
  const tile = (digit, i) => {
    const el = Object.assign(document.createElement("b"), { textContent: digit });
    if (LOGO[i % LOGO.length]) el.className = LOGO[i % LOGO.length]; // the plain grey tile has no class
    return el;
  };
  $("word-count").append(...[...String(WORD_COUNT)].map(tile));
  $("word-count").ariaLabel = `${WORD_COUNT.toLocaleString()} words`;
}

function render() {
  // Only write the secret back when it differs, so typing doesn't jump the cursor to the end.
  if ($("secret").value.toLowerCase() !== state.secret) $("secret").value = state.secret;
  $("secret-msg").textContent = state.secret.length === 4 && !isWord(state.secret) ? NOT_A_WORD : "";
  $("helper").value = state.helper;
  document.body.classList.toggle("dark", state.helper === "advanced");
  // The installed app's status or title bar follows the page into dark and back
  document.querySelector('meta[name="theme-color"]').content = getComputedStyle(document.body).getPropertyValue("--bg").trim();
  showGuess();
  duel.render();
  const { known, fitting } = deduce();
  settled = known;
  $("clear").disabled = !Object.keys(state.colours).length;
  $("guess-count").textContent = state.notes.length;
  showTimer();
  $("progress").hidden = !fitting;
  if (fitting) $("progress").textContent = progress(fitting);
  const colour = (letter) => (known[letter] ? `${known[letter]} locked` : state.colours[letter] || "");

  for (const key of $("keyboard").querySelectorAll(".key[data-letter]")) {
    key.className = `key ${colour(key.dataset.letter)}`;
  }

  const items = [...state.notes].reverse().map((note) => {
    const li = document.createElement("li");
    li.append(
      ...[...note.word].map((letter) => letterButton(letter, `tile ${colour(letter)}`)),
      Object.assign(document.createElement("span"), { className: "at", textContent: note.at == null ? "" : formatTime(note.at) }),
      Object.assign(document.createElement("span"), { className: "score", textContent: note.count }),
      button("×", "delete", () => deleteNote(note)),
    );
    return li;
  });
  if (!items.length) {
    items.push(Object.assign(document.createElement("li"), { className: "empty", textContent: "No guesses yet. Type one above and tap its score." }));
  }
  $("notes").replaceChildren(...items);
}

buildControls();
duel.init();
mode.init(render); // rejoins a saved room; the clock calls render whenever it changes
render();
duel.openLink(); // a shared duel link asks to join
setInterval(() => {
  showTimer();
  duel.tick();
}, 1000);

// Keeps the files for offline use, which also lets the page be installed as an app (sw.js)
navigator.serviceWorker?.register("sw.js").catch(() => {});
