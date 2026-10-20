// Word: notes, a keyboard to type guesses on, and letters you mark by colour. Everything stays in this browser.

import { ask } from "./ask.js"; // the page's own questions and notes
import { WORD_COUNT, fittingSets, formatTime, isWord, knownLetters, randomWords, wordsLeft, zeroGuesses } from "./helpers.js";
import * as mode from "./clock.js"; // the duel clock's logic and room
import * as duel from "./duel.js"; // the duel clock's screens: the dock, the sheet and the menu's choice

const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const NEXT_COLOUR = { "": "out", out: "unsure", unsure: "in", in: "" }; // grey → red → yellow → green: most letters are red
const STORAGE_KEY = "guess-word-v2"; // old name kept so saved games survive the rename

const NOT_A_WORD = "Not in the dictionary";
const LOCKED = "Locked until New game";
const TIME_LIMIT = 20 * 60_000; // the game's timers stop here, so one left open doesn't count up for ever
const LOGO = ["unsure", "out", "", "in"]; // the W O R D tiles' colours

const $ = (id) => document.getElementById(id);
const BACKSPACE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 5H9l-6 7 6 7h12z"/><path d="M17 9l-5 6M12 9l5 6"/></svg>';

// --- State: { notes: [{ word, count, at }] oldest first, at being ms into the game (none before the first New game), colours: { letter: "in" | "out" | "unsure" }, secret: my word,
//              helper: "" | "basic" | "advanced", how much to work out from the counts,
//              startedAt: when New game was last pressed, in ms, or null before the first one,
//              held: in a duel, the other player's claim waiting for my last guess, or null } ---

let state = load();
let settled = {}; // what the helper settled at the last render: { letter: "in" | "out" }
let guess = ""; // the guess being typed on the page's keyboard, up to 4 letters

function load() {
  const empty = { notes: [], colours: {}, secret: "", helper: "", startedAt: null, held: null };
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
async function clearColours() {
  if (await ask("Clear the key colours you set?", { yes: "Clear" })) update(() => (state.colours = {}));
}

async function addNote(count) {
  const word = guess;
  // In a duel, a guess is noted only on your turn: it's what passes the clock (typing the next one is fine)
  if (!mode.view().myTurn) return showMessage(`It's ${duel.otherName(mode.view())}'s turn`);
  if (word.length !== 4) return showMessage("Type a 4-letter word first");
  if (state.notes.some((note) => note.word === word)) return showMessage("Already noted");

  setGuess("");
  const at = state.startedAt ? gameTime() : undefined;
  update(() => {
    state.notes.push({ word, count, at });
    mode.press(); // in a duel, my clock stops and the other player's starts
  });
  // All four letters in could be their word: in a duel, the other player is asked to say so (heard() below)
  if (mode.view().phase !== "live") return;
  const claim = `All four letters are in. Is ${word.toUpperCase()} their word?`;
  const gotIt = count === 4 && (await ask(claim, { yes: "Yes, I won", no: "No" }));
  // This was the last guess after their claim: only now is it answered. Both right is a draw.
  const held = state.held;
  if (held) {
    update(() => (state.held = null));
    const right = await confirm(held, gotIt ? "Yes" : "Yes, they won");
    if (gotIt && right) return mode.send({ type: "claim", guess: word, secret: state.secret, draw: true });
    answer(held, right);
  }
  if (gotIt) mode.send({ type: "claim", guess: word, secret: state.secret, guesses: state.notes.length });
}

async function deleteNote(note) {
  if (await ask(`Remove ${note.word.toUpperCase()} (scored ${note.count})?`, { yes: "Remove" })) {
    update(() => (state.notes = state.notes.filter((n) => n !== note)));
  }
}

// In a duel, New game restarts both clocks too: that's the only way to change a word once the game is on
async function newGame() {
  const duelling = mode.view().active;
  const question = `Clear your word, guesses and key colours${duelling ? ", and restart both clocks" : ""}?`;
  if (!(await ask(question, { yes: "New game" }))) return;
  mode.newGame(); // tells the other phone too
  clearGame();
}

function clearGame() {
  showSecret(false);
  update(() => (state = { notes: [], colours: {}, secret: "", helper: state.helper, startedAt: Date.now(), held: null }));
}

// The other phone's "game" messages in a duel: a claimed win, its answer, "last", a New game and undoing a win. A claim
// carries the claimer's word, shown only once the win is confirmed; the answer carries the other word back. A claim made
// with fewer guesses here waits for this phone's last guess (addNote), which can still draw; "last" tells the claimer.
async function heard(data) {
  const them = duel.otherName(mode.view());
  if (data.type === "claim" && data.draw) {
    // Their last guess also got it, and they said ours was right: a draw, unless theirs is wrong
    const right = await confirm(data, "Yes, it's a draw");
    mode.send({ type: "answer", right, draw: true, guess: data.guess, secret: state.secret });
    mode.stop();
    if (right) drew(data.secret);
    else won(data.secret);
  } else if (data.type === "claim" && state.notes.length < Number(data.guesses)) {
    update(() => (state.held = data));
    mode.send({ type: "last" });
  } else if (data.type === "claim") {
    answer(data, await confirm(data, "Yes, they won"));
  } else if (data.type === "answer" && data.draw) {
    if (data.right) drew(data.secret);
    else lost(data.secret, `${them} says ${cleanWord(data.guess).toUpperCase()} isn't their word. ${them} wins!`);
  } else if (data.type === "answer") {
    if (data.right) won(data.secret);
    else ask(`${them} says ${cleanWord(data.guess).toUpperCase()} isn't their word. Play on.`, { no: null });
  } else if (data.type === "last") {
    ask(`${them} gets one last guess to draw.`, { no: null });
  } else if (data.type === "new") {
    update(() => (state.held = null));
    const question = `${them} started a new game, and both clocks restarted. Start a new game too?`;
    if (await ask(question, { yes: "New game", no: "Not now" })) clearGame();
  } else if (data.type === "undo") {
    // They asked to undo the last win (duel.undoWin): it's undone here only if this player agrees
    const v = mode.view();
    const question = v.last && `${them} asks to undo ${duel.lastWin(v, "their win")}, so it doesn't count. Agree?`;
    const agree = Boolean(question) && (await ask(question, { yes: "Undo it", no: "Keep it" }));
    mode.send({ type: "undone", agree });
    if (agree) mode.undo();
  } else if (data.type === "undone") {
    if (data.agree) mode.forget();
    ask(data.agree ? `${them} agreed. The win is undone and doesn't count.` : `${them} said no. The win still counts.`, { no: null });
  }
}

const cleanWord = (value) => String(value ?? "").slice(0, 4);

// Their claim on this phone's word, asked here; answer() sends the reply and ends the game if they were right
function confirm(claim, yes) {
  const them = duel.otherName(mode.view());
  return ask(`${them} says your word is ${cleanWord(claim.guess).toUpperCase()}. Are they right?`, { yes, no: "No" });
}

function answer(claim, right) {
  mode.send({ type: "answer", right, guess: claim.guess, secret: right ? state.secret : "" });
  if (!right) return;
  mode.stop();
  lost(claim.secret, `${duel.otherName(mode.view())} wins!`);
}

// A game's end, counted in the room's wins, with the other player's word if it came
function won(secret) {
  mode.ended("mine");
  const them = duel.otherName(mode.view());
  showWin(cleanWord(secret) ? `You won! ${them}'s word was` : "You won!", secret);
}

function drew(secret) {
  mode.ended(null);
  ask(`It's a draw! ${duel.otherName(mode.view())}'s word was`, { no: null, word: cleanWord(secret) });
}

function lost(secret, text) {
  mode.ended("theirs");
  showWin(cleanWord(secret) ? `${text} Their word was` : text, secret);
}

// A won game's note offers to undo the win, now the words are out and a mistake shows. The duel sheet offers it too.
async function showWin(text, secret) {
  if (!(await ask(text, { yes: "OK", no: "Undo win", word: cleanWord(secret) }))) duel.undoWin();
}

// Learn words: ten dictionary words at random as tiles, each a moment after the last
function showLearnWords() {
  const items = randomWords(10).map((word, i) => {
    const li = document.createElement("li");
    li.ariaLabel = word;
    li.style.animationDelay = `${i * 30}ms`;
    li.append(...[...word].map((letter) => Object.assign(document.createElement("b"), { textContent: letter, ariaHidden: "true" })));
    return li;
  });
  $("learn-words").replaceChildren(...items);
}

// Learn words is a view of its own at #learn, so the phone's back button returns to the game
let openedHere = false; // opened from the menu, so going back leaves the page where it was

function showView() {
  const learning = location.hash === "#learn";
  if (learning === document.body.classList.contains("learning")) return;
  document.body.classList.toggle("learning", learning);
  $("learn").hidden = !learning;
  if (learning) {
    showLearnWords();
    scrollTo(0, 0);
  }
}

function leaveLearn() {
  if (openedHere) return history.back();
  history.replaceState(null, "", location.pathname + location.search); // opened straight from a #learn link
  showView();
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

async function chooseHelper(helper) {
  if (await ask(HELPER_QUESTIONS[helper], { yes: "Switch" })) update(() => (state.helper = helper));
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
// Both stop at TIME_LIMIT into the game and turn red.
const gameTime = () => Math.min(Date.now() - state.startedAt, TIME_LIMIT);

function showTimer() {
  $("timer").hidden = $("game-stats").hidden = !state.startedAt;
  if (!state.startedAt) return;
  const elapsed = gameTime();
  const over = elapsed >= TIME_LIMIT;
  $("timer").textContent = formatTime(elapsed - (state.notes.at(-1)?.at ?? 0));
  $("game-time").textContent = formatTime(elapsed);
  $("timer").classList.toggle("over", over);
  $("game-stats").classList.toggle("over", over);
}

function showMessage(text) {
  $("msg").textContent = text;
}

// The guess in its four slots, the next one to fill underlined; the scores light up once it's full, on your turn
function showGuess() {
  for (const [i, slot] of [...$("word").children].entries()) {
    slot.textContent = guess[i] ?? "";
    slot.classList.toggle("next", i === guess.length);
  }
  $("word").ariaLabel = guess ? `Your guess: ${guess.toUpperCase()}` : "Your guess";
  $("counts").classList.toggle("ready", guess.length === 4 && mode.view().myTurn);
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
    if (document.body.classList.contains("learning")) return;
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
  $("learn-open").addEventListener("click", () => {
    $("menu").close();
    openedHere = true;
    location.hash = "learn";
  });
  $("learn-more").addEventListener("click", showLearnWords);
  $("learn-back").addEventListener("click", leaveLearn);
  addEventListener("hashchange", showView);
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
  // In a duel, a word is locked once the game is on the clocks, until either player taps New game
  const { active, started } = mode.view();
  const locked = active && started && state.secret.length === 4;
  $("secret").readOnly = locked;
  const secretMessage = state.secret.length === 4 && !isWord(state.secret) ? NOT_A_WORD : locked ? LOCKED : "";
  $("secret-msg").textContent = secretMessage;
  $("secret-msg").classList.toggle("calm", secretMessage === LOCKED);
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
mode.init(render, heard); // rejoins a saved room; the clock calls render whenever it changes
render();
showView();
duel.openLink(); // a shared duel link asks to join
setInterval(() => {
  showTimer();
  duel.tick();
}, 1000);

// Keeps the files for offline use, which also lets the page be installed as an app (sw.js)
navigator.serviceWorker?.register("sw.js").catch(() => {});
