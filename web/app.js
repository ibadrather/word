// Word: notes, a keyboard to type guesses on, and letters you mark by colour. Everything stays in this browser.

import { ask } from "./ask.js"; // the page's own questions and notes
import { WORD_COUNT, WORD_COUNT_5, fittingSets, formatTime, isWord, knownLetters, lettersOf, loadMeanings, randomWords, wordsLeft, zeroGuesses } from "./helpers.js";
import * as mode from "./clock.js"; // the duel clock's logic and room
import * as duel from "./duel.js"; // the duel clock's screens: the dock and the sheet
import * as group from "./group.js"; // the group game's logic and room
import * as modes from "./modes.js"; // which way you play: the menu's choice, and what a guess or New game does in it
import { press } from "./sheet.js"; // the chips of Learn words and How to play

const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const NEXT_COLOUR = { "": "out", out: "unsure", unsure: "in", in: "" }; // grey → red → yellow → green: most letters are red
const STORAGE_KEY = "guess-word-v2"; // old name kept so saved games survive the rename

const NOT_A_WORD = "Not in the dictionary";
const LOCKED = "Locked until New game";
const TIME_LIMIT = 20 * 60_000; // the game's timers stop here, so one left open doesn't count up for ever

const $ = (id) => document.getElementById(id);
const BACKSPACE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 5H9l-6 7 6 7h12z"/><path d="M17 9l-5 6M12 9l5 6"/></svg>';

// --- State: { notes: [{ word, count, at }] oldest first, at being ms into the game (none before the first New game), colours: { letter: "in" | "out" | "unsure" }, secret: my word,
//              helper: "" | "basic" | "advanced", how much to work out from the counts,
//              startedAt: when New game was last pressed, in ms, or null before the first one,
//              held: in a duel, the other player's claim waiting for my last guess, or null } ---

let state = load();
let settled = {}; // what the helper settled at the last render: { letter: "in" | "out" }
let guess = ""; // the guess being typed on the page's keyboard, up to letters() long
let learnLetters = 4; // the length of the words Learn words shows
let dealt = 0; // how many tens Learn words has asked for, so a slow load never shows an older ten over a newer one

function load() {
  const empty = { notes: [], colours: {}, secret: "", helper: "", startedAt: null, held: null };
  try {
    return { ...empty, ...JSON.parse(localStorage.getItem(STORAGE_KEY)) };
  } catch {
    return empty;
  }
}

// The key colours and helper the page shows: this game's, or a group game's own on this phone (modes.js)
const book = () => modes.page()?.book ?? state;
// How long a guess is: 4 letters, or a group game's 4 or 5
const letters = () => modes.page()?.letters ?? 4;

function update(change) {
  change();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
  modes.saveBook(); // a group game's colours and helper
  render();
}

// --- Actions ---

// The page's keyboard only types: any key, whatever its colour. Colours are set from the guess list's tiles.
function type(letter) {
  if (guess.length < letters()) setGuess(guess + letter);
}

function backspace() {
  setGuess(guess.slice(0, -1));
}

function setGuess(word) {
  guess = word;
  showMessage(guess.length === letters() && !isWord(guess) ? NOT_A_WORD : ""); // a warning only: you can still note it, except in a group game
  showGuess();
}

function cycleColour(letter) {
  if (settled[letter]) return; // the helper has settled this letter, so it stays put
  update(() => {
    const { colours } = book();
    const next = NEXT_COLOUR[colours[letter] || ""];
    if (next) colours[letter] = next;
    else delete colours[letter];
  });
}

// Only your own marks: letters a helper set stay, as they come from the scores
async function clearColours() {
  if (await ask("Clear the key colours you set?", { yes: "Clear" })) update(() => (book().colours = {}));
}

async function addNote(count) {
  const word = guess;
  // In a duel, a guess is noted only on your turn: it's what passes the clock (typing the next one is fine)
  const notYet = modes.turn();
  if (notYet) return showMessage(notYet);
  if (word.length !== 4) return showMessage("Type a 4-letter word first");
  if (state.notes.some((note) => note.word === word)) return showMessage("Already noted");

  setGuess("");
  const at = state.startedAt ? gameTime() : undefined;
  update(() => {
    state.notes.push({ word, count, at });
    modes.note(word, count); // in a duel, my clock stops and the other player's starts
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

// In a group game the phone scores the guess itself. One it can't take (not a word, already guessed, not your turn)
// is refused, and the turn isn't used.
function guessWord() {
  if (guess.length !== letters()) return showMessage(`Type a ${letters()}-letter word first`);
  const refused = modes.guess(guess);
  if (refused) return showMessage(refused);
  setGuess("");
}

async function deleteNote(note) {
  if (await ask(`Remove ${note.word.toUpperCase()} (scored ${note.count})?`, { yes: "Remove" })) {
    update(() => (state.notes = state.notes.filter((n) => n !== note)));
  }
}

// In a duel, New game restarts both clocks too (modes.js asks in the mode's own words)
async function newGame() {
  if (await modes.newGame()) clearGame();
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

// A word's meaning in `meanings` (loadMeanings), or "" for one without
const meaningOf = (meanings, word) => (Object.hasOwn(meanings, word) ? meanings[word] : "");

// Learn words: ten common words of the chosen length at random, each with its meaning, a moment after the last. Only
// words with a meaning are picked, unless the meanings can't load.
async function showLearnWords() {
  press($("learn-letters"), learnLetters);
  const deal = ++dealt;
  const picked = randomWords(20, Math.random, learnLetters);
  const meanings = await loadMeanings();
  if (deal !== dealt) return;
  const known = picked.filter((word) => meaningOf(meanings, word));
  const items = (known.length >= 10 ? known : picked).slice(0, 10).map((word, i) => {
    const row = document.createElement("div");
    row.style.animationDelay = `${i * 30}ms`;
    const meaning = Object.assign(document.createElement("dd"), { textContent: meaningOf(meanings, word) });
    row.append(Object.assign(document.createElement("dt"), { textContent: word }), meaning);
    return row;
  });
  $("learn-words").replaceChildren(...items);
}

// Learn words' look-up, from 4 letters on: the word as tiles, its meaning if it has one, and whether the dictionary
// knows it
async function lookUp() {
  const input = $("lookup");
  input.value = input.value.replace(/[^a-z]/gi, "").slice(0, 5);
  const word = input.value.toLowerCase();
  const meanings = word.length < 4 ? {} : await loadMeanings();
  if (input.value.toLowerCase() !== word) return; // typed on while the meanings loaded
  $("lookup-result").hidden = word.length < 4;
  if (word.length < 4) return;
  const known = isWord(word);
  const meaning = meaningOf(meanings, word);
  $("lookup-word").ariaLabel = word;
  $("lookup-word").replaceChildren(...[...word].map((letter) => Object.assign(document.createElement("b"), { textContent: letter })));
  $("lookup-meaning").hidden = !meaning;
  $("lookup-meaning").textContent = meaning;
  $("lookup-verdict").textContent = !known ? NOT_A_WORD : meaning ? "In the dictionary" : "In the dictionary. No meaning for this one.";
  $("lookup-verdict").classList.toggle("no", !known);
}

// How to play: the rules of one way to play, picked by its chip
function showRules(mode) {
  press($("rules-modes"), mode);
  for (const rules of document.querySelectorAll("[data-rules]")) rules.hidden = rules.dataset.rules !== mode;
}

// How to play and Learn words are views of their own, at #rules and #learn, in place of the game, so the phone's back
// button returns to it
const VIEWS = ["rules", "learn"];
let viewing = ""; // the view shown, or "" for the game
let openedHere = false; // opened from the menu, so going back leaves the page where it was

function showView() {
  const view = VIEWS.find((id) => location.hash === `#${id}`) ?? "";
  if (view === viewing) return;
  viewing = view;
  document.body.classList.toggle("viewing", Boolean(view));
  for (const id of VIEWS) $(id).hidden = id !== view;
  if (!view) openedHere = false;
  if (view === "rules") showRules(modes.on()); // the rules of the way you play
  if (view === "learn") showLearnWords();
  if (view) scrollTo(0, 0);
}

function leaveView() {
  if (openedHere) return history.back();
  history.replaceState(null, "", location.pathname + location.search); // opened straight from a link
  showView();
}

// The menu's "Now playing" card: the online mode's own words (modes.js), or face to face this page's game
function showNow() {
  const count = state.notes.length;
  const guesses = count ? `${count} ${count === 1 ? "guess" : "guesses"}` : "No guesses yet";
  const face = { title: "Face to face", lines: [guesses + (state.startedAt ? ` · ${formatTime(gameTime())}` : "")] };
  const now = modes.status() ?? face;
  $("now-title").textContent = now.title;
  $("now-lines").replaceChildren(...now.lines.filter(Boolean).map((line) => Object.assign(document.createElement("span"), { textContent: line })));
  $("now-dot").className = `dot ${now.dot ?? ""}`;
  $("now-dot").hidden = now.dot === undefined; // face to face has no other phone to be connected to
  $("now-open").hidden = !now.open;
  $("now-open").textContent = now.open ?? "";
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
  if (await ask(HELPER_QUESTIONS[helper], { yes: "Switch" })) update(() => (book().helper = helper));
  else render(); // put the dropdown back
}

// What the chosen helper has settled ({ letter: "in" | "out" }), and for the advanced one its progress line
// (progress()), from the guesses of a `length`-letter game
function deduce(notes, { helper, colours }, length) {
  if (helper === "basic") return { known: zeroGuesses(notes) };
  if (helper === "advanced") {
    const fitting = fittingSets(notes, length);
    return { known: knownLetters(fitting, colours), line: progress(fitting, notes, length) };
  }
  return { known: {} };
}

const plural = (count, noun) => `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`;

// The advanced helper's progress line. It counts the words left but never shows one.
function progress(fitting, notes, length) {
  const count = length === 5 ? WORD_COUNT_5 : WORD_COUNT;
  if (!notes.length) return `${plural(count, "word")} to start. Every score you note narrows them down.`;
  if (!fitting.length) return "No letters fit all these scores. Check them for a mistake.";
  const words = plural(wordsLeft(fitting, notes, length), "possible word");
  if (fitting.length === 1) return `Letters found: ${[...lettersOf(fitting[0]).toUpperCase()].join(" ")}. ${words} left!`;
  return `${words}, ${plural(fitting.length, "letter set")} left`;
}

// On top, the time since your last guess (since New game before the first one); the game time sits by "Your guesses".
// In a duel the two players' clocks tick in the dock at the bottom (duel.js); the game's own times stay as they are.
// Both stop at TIME_LIMIT into the game and turn red. A group game has only the time since the deal, from its table,
// stopping when the game ends: each player's own clock is in the dock, and a second one on top read as yours.
const gameTime = () => Math.min(Date.now() - state.startedAt, TIME_LIMIT);

function showTimer(page = modes.page()) {
  if (page) {
    $("timer").hidden = true;
    $("game-stats").hidden = !page.time;
    $("game-stats").classList.remove("over");
    if (page.time) $("game-time").textContent = formatTime(page.time.game);
    return;
  }
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

// The guess in its slots, one a letter, the next one to fill underlined; the scores light up once it's full, on your
// turn. A 4-letter game after a 5-letter one drops the guess's last letter. In a group game the Guess button says
// whose turn it is: filled with the guess once it's full on yours, outlined while you type, grey on someone else's.
function showGuess(page = modes.page()) {
  const length = page?.letters ?? 4;
  if (guess.length > length) guess = guess.slice(0, length);
  if ($("word").children.length !== length) {
    $("word").replaceChildren(...Array.from({ length }, () => document.createElement("span")));
  }
  for (const [i, slot] of [...$("word").children].entries()) {
    slot.textContent = guess[i] ?? "";
    slot.classList.toggle("next", i === guess.length);
  }
  $("word").ariaLabel = guess ? `Your guess: ${guess.toUpperCase()}` : "Your guess";
  const ready = guess.length === length && !(page ? page.waiting : modes.turn());
  $("counts").classList.toggle("ready", ready);
  $("guess-row").classList.toggle("ready", ready);
  if (!page) return;
  $("guess-row").classList.toggle("mine", !page.waiting);
  $("guess").textContent = page.waiting || (ready ? `Guess ${guess.toUpperCase()}` : "Your turn");
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
    if (viewing) return;
    if (event.target.closest("input, select, textarea")) return;
    if (/^[a-z]$/i.test(event.key)) type(event.key.toLowerCase());
    else if (event.key === "Backspace") backspace();
    // Enter notes a group game's guess, unless it's pressing another button (the page's keys and Guess don't count)
    else if (event.key === "Enter" && modes.page() && !event.target.closest("button:not(.key, #guess)")) guessWord();
    else return;
    event.preventDefault();
  });
  $("secret").addEventListener("input", (event) => {
    event.target.value = event.target.value.replace(/[^a-z]/gi, "").slice(0, 4);
    update(() => (state.secret = event.target.value.toLowerCase()));
  });
  $("reveal").addEventListener("click", () => showSecret($("secret").type === "password"));
  $("guess").addEventListener("click", guessWord);
  $("reset").addEventListener("click", newGame);
  $("clear").addEventListener("click", clearColours);
  $("logo").addEventListener("click", () => {
    showNow();
    $("menu").showModal();
  });
  $("close").addEventListener("click", () => $("menu").close());
  $("menu").addEventListener("click", (event) => {
    if (event.target === $("menu")) $("menu").close(); // a tap on the dimmed page outside the drawer
  });
  $("now-open").addEventListener("click", () => {
    $("menu").close();
    modes.openSheet();
  });
  // How to play and Learn words: the link changes the address, and showView() the page
  for (const link of document.querySelectorAll(".menu-link")) {
    link.addEventListener("click", () => {
      $("menu").close();
      openedHere = true;
    });
  }
  for (const back of document.querySelectorAll(".view .back")) back.addEventListener("click", leaveView);
  addEventListener("hashchange", showView);
  for (const chip of $("rules-modes").children) chip.addEventListener("click", () => showRules(chip.dataset.value));
  $("lookup").addEventListener("input", lookUp);
  $("learn-more").addEventListener("click", showLearnWords);
  for (const chip of $("learn-letters").children) {
    chip.addEventListener("click", () => {
      learnLetters = Number(chip.dataset.value);
      showLearnWords();
    });
  }
  $("helper").addEventListener("change", (event) => chooseHelper(event.target.value));
  // The dictionaries' sizes, in the menu and How to play
  for (const el of document.querySelectorAll("[data-count]")) {
    el.textContent = (el.dataset.count === "5" ? WORD_COUNT_5 : WORD_COUNT).toLocaleString();
  }
}

function render() {
  // A group game shows its table's guesses, with this phone's own colours and helper, and has no secret to type
  const page = modes.page();
  const notes = page ? page.notes : state.notes;
  const { colours, helper } = book();
  $("secret-part").hidden = Boolean(page);
  $("counts-label").hidden = $("counts").hidden = Boolean(page);
  $("guess-row").hidden = !page;
  $("guesses-title").textContent = page ? "Guesses" : "Your guesses";
  // In a group game the header's button deals, and only between games
  $("reset-new").hidden = Boolean(page);
  $("reset-deal").hidden = !page;
  $("reset").disabled = Boolean(page?.playing);
  // Only write the secret back when it differs, so typing doesn't jump the cursor to the end.
  if ($("secret").value.toLowerCase() !== state.secret) $("secret").value = state.secret;
  // In a duel, a word is locked once the game is on the clocks, until either player taps New game
  const { active, started } = mode.view();
  const locked = active && started && state.secret.length === 4;
  $("secret").readOnly = locked;
  const secretMessage = state.secret.length === 4 && !isWord(state.secret) ? NOT_A_WORD : locked ? LOCKED : "";
  $("secret-msg").textContent = secretMessage;
  $("secret-msg").classList.toggle("calm", secretMessage === LOCKED);
  $("helper").value = helper;
  document.body.classList.toggle("dark", helper === "advanced");
  // The installed app's status or title bar follows the page into dark and back
  document.querySelector('meta[name="theme-color"]').content = getComputedStyle(document.body).getPropertyValue("--bg").trim();
  showGuess(page);
  modes.render();
  if ($("menu").open) showNow();
  // In a group game the helper works from everyone's guesses, but never another player's hidden winning one. Its
  // length is the guesses': between games the next deal's may already be another.
  const guessed = notes.filter((note) => note.word && !note.hidden);
  const { known, line } = deduce(guessed, book(), guessed[0]?.word.length ?? letters());
  settled = known;
  $("clear").disabled = !Object.keys(colours).length;
  $("guess-count").textContent = notes.length;
  showTimer(page);
  $("progress").hidden = !line;
  if (line) $("progress").textContent = line;
  const colour = (letter) => (known[letter] ? `${known[letter]} locked` : colours[letter] || "");

  for (const key of $("keyboard").querySelectorAll(".key[data-letter]")) {
    key.className = `key ${colour(key.dataset.letter)}`;
  }

  // In a group game each guess says who made it, and can't be removed. Another player's winning guess shows only
  // that they got it, until the game is over.
  const items = [...notes].reverse().map((note) => {
    const li = document.createElement("li");
    li.classList.toggle("five", note.word.length === 5);
    li.classList.toggle("mine", Boolean(page && note.mine));
    li.classList.toggle("won", Boolean(note.won));
    const span = (className, textContent) => Object.assign(document.createElement("span"), { className, textContent });
    if (note.hidden) li.append(span("got", "Got it"));
    else li.append(...[...note.word].map((letter) => letterButton(letter, `tile ${colour(letter)}`)));
    if (page) li.append(span("who", note.who));
    li.append(span("at", note.at == null ? "" : formatTime(note.at)), span("score", note.hidden ? "✓" : note.count));
    if (!page) li.append(button("×", "delete", () => deleteNote(note)));
    return li;
  });
  if (!items.length) {
    const empty = !page ? "No guesses yet. Type one above and tap its score." : page.time ? "No guesses yet." : page.empty;
    items.push(Object.assign(document.createElement("li"), { className: "empty", textContent: empty }));
  }
  $("notes").replaceChildren(...items);
}

buildControls();
mode.init(render, heard); // the clock calls render whenever it changes
group.init(render); // and so does the group game
modes.init(); // rejoins the saved mode's room
render();
showView();
modes.openLink(); // a shared link asks to join
setInterval(() => {
  const page = modes.page();
  showTimer(page);
  if (page) showGuess(page); // a clock that ran out passes the turn with no message
  modes.tick();
  if ($("menu").open) showNow(); // the game's time
}, 1000);

// Keeps the files for offline use, which also lets the page be installed as an app (sw.js)
navigator.serviceWorker?.register("sw.js").catch(() => {});
