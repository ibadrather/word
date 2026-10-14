// Guess Word: notes and a colour-marking keyboard. Everything stays in this browser.

const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const NEXT_COLOUR = { "": "in", in: "out", out: "unsure", unsure: "" }; // grey → green → red → not sure → grey
const STORAGE_KEY = "guess-word-v2";

const $ = (id) => document.getElementById(id);

// --- State: { notes: [{ word, count }] oldest first, colours: { letter: "in" | "out" | "unsure" }, secret: my word } ---

let state = load();

function load() {
  const empty = { notes: [], colours: {}, secret: "" };
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
    update(() => (state = { notes: [], colours: {}, secret: "" }));
  }
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
}

function render() {
  $("secret").value = state.secret;
  const colour = (letter) => state.colours[letter] || "";

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
    items.push(Object.assign(document.createElement("li"), { className: "empty", textContent: "None yet" }));
  }
  $("notes").replaceChildren(...items);
}

buildControls();
render();
