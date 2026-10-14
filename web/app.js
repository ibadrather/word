// Word: notes and a colour-marking keyboard. Everything stays in this browser.

import { WORD_COUNT, fittingSets, isWord, knownLetters, wordsLeft, zeroGuesses } from "./helpers.js";

const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const NEXT_COLOUR = { "": "out", out: "unsure", unsure: "in", in: "" }; // grey → red → yellow → green: most letters are red
const STORAGE_KEY = "guess-word-v2"; // old name kept so saved games survive the rename

const NOT_A_WORD = "Not in the dictionary";
const LOGO = ["unsure", "out", "", "in"]; // the W O R D tiles' colours

const $ = (id) => document.getElementById(id);

// --- State: { notes: [{ word, count }] oldest first, colours: { letter: "in" | "out" | "unsure" }, secret: my word,
//              helper: "" | "basic" | "advanced", how much to work out from the counts } ---

let state = load();
let settled = {}; // what the helper settled at the last render: { letter: "in" | "out" }

function load() {
  const empty = { notes: [], colours: {}, secret: "", helper: "" };
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

function cycleColour(letter) {
  if (settled[letter]) return; // the helper has settled this letter, so it stays put
  update(() => {
    const next = NEXT_COLOUR[state.colours[letter] || ""];
    if (next) state.colours[letter] = next;
    else delete state.colours[letter];
  });
}

function addNote(count) {
  const word = $("word").value.toLowerCase();
  if (word.length !== 4) return showMessage("Type a 4-letter word first");
  if (state.notes.some((note) => note.word === word)) return showMessage("Already noted");

  $("word").value = "";
  $("word").blur();
  showMessage("");
  update(() => state.notes.push({ word, count }));
}

function deleteNote(note) {
  if (confirm(`Remove ${note.word.toUpperCase()} (scored ${note.count})?`)) {
    update(() => (state.notes = state.notes.filter((n) => n !== note)));
  }
}

function newGame() {
  if (confirm("Clear your word, guesses and key colours?")) {
    showSecret(false);
    update(() => (state = { notes: [], colours: {}, secret: "", helper: state.helper }));
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

function showMessage(text) {
  $("msg").textContent = text;
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

function letterButton(letter, className) {
  const el = button(letter, className, () => cycleColour(letter));
  el.dataset.letter = letter;
  return el;
}

function buildControls() {
  for (const letters of ROWS) {
    const row = document.createElement("div");
    row.className = "row";
    row.append(...[...letters].map((letter) => letterButton(letter, "key")));
    $("keyboard").append(row);
  }
  for (let count = 0; count <= 4; count++) {
    $("counts").append(button(count, "", () => addNote(count)));
  }
  $("word").addEventListener("input", (event) => {
    event.target.value = event.target.value.replace(/[^a-z]/gi, "").slice(0, 4);
    const word = event.target.value.toLowerCase();
    showMessage(word.length === 4 && !isWord(word) ? NOT_A_WORD : ""); // a warning only: you can still note it
    $("counts").classList.toggle("ready", word.length === 4);
  });
  $("secret").addEventListener("input", (event) => {
    event.target.value = event.target.value.replace(/[^a-z]/gi, "").slice(0, 4);
    update(() => (state.secret = event.target.value.toLowerCase()));
  });
  $("reveal").addEventListener("click", () => showSecret($("secret").type === "password"));
  $("reset").addEventListener("click", newGame);
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
  $("counts").classList.toggle("ready", $("word").value.length === 4);
  const { known, fitting } = deduce();
  settled = known;
  $("progress").hidden = !fitting;
  if (fitting) $("progress").textContent = progress(fitting);
  const colour = (letter) => (known[letter] ? `${known[letter]} locked` : state.colours[letter] || "");

  for (const key of $("keyboard").querySelectorAll(".key")) {
    key.className = `key ${colour(key.dataset.letter)}`;
  }

  const items = [...state.notes].reverse().map((note) => {
    const li = document.createElement("li");
    li.append(
      ...[...note.word].map((letter) => letterButton(letter, `tile ${colour(letter)}`)),
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
render();

// Keeps the files for offline use, which also lets the page be installed as an app (sw.js)
navigator.serviceWorker?.register("sw.js").catch(() => {});
