// Word: notes and a colour-marking keyboard. Everything stays in this browser.

const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const NEXT_COLOUR = { "": "out", out: "unsure", unsure: "in", in: "" }; // grey → red → yellow → green: most letters are red
const STORAGE_KEY = "guess-word-v2";
const ALPHABET = "abcdefghijklmnopqrstuvwxyz";

const $ = (id) => document.getElementById(id);

// --- State: { notes: [{ word, count }] oldest first, colours: { letter: "in" | "out" | "unsure" }, secret: my word,
//              helper: "" | "basic" | "advanced", how much to work out from the counts } ---

let state = load();

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
  if (deduce()[letter]) return; // the helper has settled this letter, so it stays put
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
  update(() => (state.notes = state.notes.filter((n) => n !== note)));
}

function newGame() {
  if (confirm("Clear your word, guesses and key colours?")) {
    update(() => (state = { notes: [], colours: {}, secret: "", helper: state.helper }));
  }
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

// What the chosen helper has settled: { letter: "in" | "out" }.
function deduce() {
  if (state.helper === "basic") return zeroGuesses();
  if (state.helper === "advanced") return letterSets();
  return {};
}

// --- Basic helper: a guess that scored 0 has none of its letters in the word. ---

function zeroGuesses() {
  const known = {};
  for (const { word, count } of state.notes) {
    if (count === 0) for (const letter of word) known[letter] = "out";
  }
  return known;
}

// --- Advanced helper: try every set of up to 4 letters the secret word could use (about 18,000) and keep the
// ones that give every guess its count. A letter in all of them is green, in none of them red.
// Repeated letters in a guess count once. Your green/red marks narrow it down too, but never your
// mark on the letter itself, so a letter the counts settle can't be changed by tapping it. ---

const LETTER_SETS = allSets("", 0);

function allSets(chosen, from) {
  const sets = chosen ? [chosen] : [];
  if (chosen.length === 4) return sets;
  for (let i = from; i < ALPHABET.length; i++) sets.push(...allSets(chosen + ALPHABET[i], i + 1));
  return sets;
}

function letterSets() {
  const fitting = LETTER_SETS.filter((set) =>
    state.notes.every(({ word, count }) => [...new Set(word)].filter((letter) => set.includes(letter)).length === count),
  );
  const marks = Object.entries(state.colours).filter(([, colour]) => colour !== "unsure");
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
    showMessage("");
    render();
  });
  $("secret").addEventListener("input", (event) => {
    event.target.value = event.target.value.replace(/[^a-z]/gi, "").slice(0, 4);
    update(() => (state.secret = event.target.value.toLowerCase()));
  });
  $("reveal").addEventListener("click", () => {
    const hidden = $("secret").type === "password";
    $("secret").type = hidden ? "text" : "password";
    $("reveal").textContent = hidden ? "Hide" : "Show";
  });
  $("reset").addEventListener("click", newGame);
  $("helper").addEventListener("change", (event) => chooseHelper(event.target.value));
}

function render() {
  $("secret").value = state.secret;
  $("helper").value = state.helper;
  document.body.classList.toggle("dark", state.helper === "advanced");
  $("counts").classList.toggle("ready", $("word").value.length === 4);
  const known = deduce();
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
