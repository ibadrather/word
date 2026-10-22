// Word: notes, a keyboard to type guesses on, and letters you mark by colour. Everything stays in this browser.

import { ask } from "./ask.js"; // the page's own questions and notes
import { $, create, tiles } from "./dom.js";
import {
  WORD_COUNT,
  WORD_COUNT_5,
  fittingSets,
  formatTime,
  isWord,
  knownLetters,
  loadMeanings,
  meaningOf,
  randomWords,
  wordsLeft,
  zeroGuesses,
} from "./helpers.js";
import * as mode from "./clock.js"; // the duel clock's logic and room
import * as duel from "./duel.js"; // the duel clock's screens: the dock and the sheet
import * as group from "./group.js"; // the group game's logic and room
import * as modes from "./modes.js"; // which way you play: the menu's choice, and what a guess or New game does in it
import { closable, press } from "./sheet.js"; // the menu folding away, and the chips of Learn words and How to play
import { isObject, readObject, writeObject } from "./storage.js";

const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const NEXT_COLOUR = { "": "out", out: "unsure", unsure: "in", in: "" }; // grey → red → yellow → green: most letters are red
const STORAGE_KEY = "guess-word-v2"; // old name kept so saved games survive the rename

const NOT_A_WORD = "Not in the dictionary";
const TIME_LIMIT = 20 * 60_000; // the game's timers stop here, so one left open doesn't count up for ever

// The page's icons, each an <svg> drawn in the text's colour
const icon = (paths) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const BACKSPACE_ICON = icon('<path d="M21 5H9l-6 7 6 7h12z"/><path d="M17 9l-5 6M12 9l5 6"/>');
const DELETE_ICON = icon('<path d="M6 6l12 12M18 6L6 18"/>');
const PLUS_ICON = icon('<path d="M12 5v14M5 12h14"/>');
const ALERT_ICON = icon('<circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16h.01"/>');
const EYE_ICON = icon('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>');
const EYE_OFF_ICON = icon('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><path d="M4 4l16 16"/>');
const LOCK_ICON = icon('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>');
const TIME_UP_ICON = icon('<circle cx="12" cy="13" r="8"/><path d="M12 9v4"/><path d="M9 2h6"/>');

// --- State: { notes: [{ word, count, at }] oldest first, at being ms into the game (none before the first New game), colours: { letter: "in" | "out" | "unsure" }, secret: my word,
//              helper: "" | "basic" | "advanced", how much to work out from the counts,
//              startedAt: when New game was last pressed, in ms, or null before the first one,
//              held: in a duel, the other player's claim waiting for my last guess, or null } ---

// A game with no word, guesses or colours yet
const blank = (helper, startedAt) => ({ notes: [], colours: {}, secret: "", helper, startedAt, held: null });

let state = load();
let settled = {}; // what the helper settled at the last render: { letter: "in" | "out" }
let wordsHelped = ""; // the advanced helper's count of the words left, at the last render, or ""
let guess = ""; // the guess being typed on the page's keyboard, up to letters() long
let draft = null; // the secret word being typed in its panel, or null while the panel is shut
let draftHidden = false; // the panel shows the draft as dots
let revealed = false; // the info line shows a word locked in a duel, rather than dots
let rows = -1; // how many rows the guess list had at the last render, so it scrolls to the newest only when it grows
let listed = 0; // how many guesses and players going out the list showed at the last render

// The guess list's card that offers to set your word, and its last row, the guess being typed: render() takes them out
// and puts them back in, so they're kept here
const START = $("start");
const TYPING = $("typing");
let learnLetters = 4; // the length of the words Learn words shows
let dealt = 0; // how many tens Learn words has asked for, so a slow load never shows an older ten over a newer one

// An older save lacks the newer fields, so the defaults fill them in; a damaged one can't break the page, as the parts
// it draws from are checked
function load() {
  const saved = { ...blank("", null), ...readObject(STORAGE_KEY) };
  const notes = Array.isArray(saved.notes) ? saved.notes.filter((note) => typeof note?.word === "string") : [];
  const colours = isObject(saved.colours) ? saved.colours : {};
  const secret = typeof saved.secret === "string" ? saved.secret : "";
  return { ...saved, notes, colours, secret };
}

// The key colours and helper the page shows: this game's, or a group game's own on this phone (modes.js)
const book = () => modes.page()?.book ?? state;
// How long a guess is: 4 letters, or a group game's 4 or 5
const letters = () => modes.page()?.letters ?? 4;

function update(change) {
  change();
  writeObject(STORAGE_KEY, state);
  modes.saveBook(); // a group game's colours and helper
  render();
}

// --- Actions ---

// The page's keyboard only types, into your secret word while its panel is open, else the guess: any key, whatever
// its colour. Colours are set from the guess list's tiles.
function type(letter) {
  if (draft !== null) {
    if (draft.length < 4) setDraft(draft + letter);
  } else if (guess.length < letters()) setGuess(guess + letter);
}

function backspace() {
  if (draft !== null) setDraft(draft.slice(0, -1));
  else setGuess(guess.slice(0, -1));
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
  revealed = false;
  update(() => (state = blank(state.helper, Date.now())));
}

// --- Your secret word: optional, set in a panel over the page's keyboard, and in a duel locked once the game is on
//     the clocks, until either player taps New game ---

const locked = () => {
  const { active, started } = mode.view();
  return active && started && state.secret.length === 4;
};

// The info line's chip: a locked word shows or hides in place; any other opens the panel to set or change it
function tapChip() {
  if (!locked()) return openPanel();
  revealed = !revealed;
  showChip();
}

function openPanel() {
  if (locked()) return;
  draft = state.secret;
  draftHidden = Boolean(draft); // a word already set opens hidden, as the other player may be looking
  showPanel();
  $("word-panel").focus();
}

// ×, Escape or a tap on the dimmed page: the word stays as it was
function closePanel() {
  if (draft === null) return;
  draft = null;
  showPanel();
  (START.isConnected ? START.querySelector("button") : $("secret-chip")).focus();
}

function setDraft(word) {
  draft = word;
  showPanel();
}

// A common word at random, hidden until you look
function pickWord() {
  draftHidden = true;
  setDraft(randomWords(1)[0]);
}

// Done keeps the word, unless the duel's clocks started with a word already set while the panel was open
function keepWord() {
  if (draft?.length !== 4) return;
  const word = draft;
  if (!locked()) update(() => (state.secret = word));
  closePanel();
}

function showPanel() {
  const open = draft !== null;
  $("word-panel").hidden = $("scrim").hidden = !open;
  document.querySelector("main").classList.toggle("setting", open);
  if (!open) return;
  const word = draft;
  for (const [i, box] of [...$("word-draft").children].entries()) {
    box.textContent = word[i] ? (draftHidden ? "•" : word[i]) : "";
    box.classList.toggle("next", i === word.length);
  }
  const typed = [...word.toUpperCase()].join(", ");
  $("word-draft").ariaLabel = !word ? "Nothing typed yet" : draftHidden ? `${word.length} letters, hidden` : `Typed so far: ${typed}`;
  $("word-hide").innerHTML = draftHidden ? EYE_ICON : EYE_OFF_ICON;
  $("word-hide").append(draftHidden ? "Show it" : "Hide it");
  const unknown = word.length === 4 && !isWord(word);
  $("word-note").textContent = unknown ? NOT_A_WORD : "Only you see it. In a duel it locks once the clocks start.";
  $("word-note").classList.toggle("warn", unknown); // a warning only: it can still be your word
  $("word-done").disabled = word.length !== 4;
}

// The other phone's "game" messages in a duel: a claimed win, its answer, "last", a New game and undoing a win. A claim
// carries the claimer's word, shown only once the win is confirmed; the answer carries the other word back. A claim made
// with fewer guesses here waits for this phone's last guess (addNote), which can still draw; "last" tells the claimer.
async function heard(data) {
  if (Object.hasOwn(GAME_MESSAGES, data.type)) await GAME_MESSAGES[data.type](data, duel.otherName(mode.view()));
}

// Each message type's handler, with the other player's name (`them`)
const GAME_MESSAGES = {
  async claim(data) {
    if (data.draw) {
      // Their last guess also got it, and they said ours was right: a draw, unless theirs is wrong
      const right = await confirm(data, "Yes, it's a draw");
      mode.send({ type: "answer", right, draw: true, checked: checked(), guess: data.guess, secret: state.secret });
      mode.stop();
      if (right) drew(data.secret);
      else won(data.secret);
    } else if (state.notes.length < Number(data.guesses)) {
      update(() => (state.held = data));
      mode.send({ type: "last" });
    } else {
      answer(data, await confirm(data, "Yes, they won"));
    }
  },
  answer(data, them) {
    const guessed = cleanWord(data.guess).toUpperCase();
    // Their phone checked it against the word they set, or else they said so
    const wrong = data.checked ? `${guessed} isn't ${them}'s word.` : `${them} says ${guessed} isn't their word.`;
    if (data.draw && data.right) drew(data.secret);
    else if (data.draw) lost(data.secret, `${wrong} ${them} wins!`);
    else if (data.right) won(data.secret);
    else ask(`${wrong} Play on.`, { no: null });
  },
  last(data, them) {
    ask(`${them} gets one last guess to draw.`, { no: null });
  },
  async new(data, them) {
    update(() => (state.held = null));
    const question = `${them} started a new game, and both clocks restarted. Start a new game too?`;
    if (await ask(question, { yes: "New game", no: "Not now" })) clearGame();
  },
  // They asked to undo the last win (duel.undoWin): it's undone here only if this player agrees
  async undo(data, them) {
    const v = mode.view();
    const question = v.last && `${them} asks to undo ${duel.lastWin(v, "their win")}, so it doesn't count. Agree?`;
    const agree = Boolean(question) && (await ask(question, { yes: "Undo it", no: "Keep it" }));
    mode.send({ type: "undone", agree });
    if (agree) mode.undo();
  },
  undone(data, them) {
    if (data.agree) mode.forget();
    ask(data.agree ? `${them} agreed. The win is undone and doesn't count.` : `${them} said no. The win still counts.`, { no: null });
  },
};

const cleanWord = (value) => String(value ?? "").slice(0, 4);

// Their claim on this phone's word. With a word set, the page checks it; with none, it can't, so it asks. answer()
// sends the reply and ends the game if they were right.
const checked = () => state.secret.length === 4;

async function confirm(claim, yes) {
  const word = cleanWord(claim.guess);
  if (checked()) return word === state.secret;
  const them = duel.otherName(mode.view());
  const note = "You didn't set a word, so the page can't check it. Answer honestly.";
  return ask(`${them} guessed this and says it's your word. Is it?`, { yes, no: "No", word, note });
}

function answer(claim, right) {
  mode.send({ type: "answer", right, checked: checked(), guess: claim.guess, secret: right ? state.secret : "" });
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
    const row = create("div");
    row.style.animationDelay = `${i * 30}ms`;
    row.append(create("dt", { textContent: word }), create("dd", { textContent: meaningOf(meanings, word) }));
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
  $("lookup-word").replaceChildren(...tiles(word));
  $("lookup-meaning").hidden = !meaning;
  $("lookup-meaning").textContent = meaning;
  $("lookup-verdict").textContent = !known ? NOT_A_WORD : meaning ? "In the dictionary" : "In the dictionary. No meaning for this one.";
  $("lookup-verdict").classList.toggle("no", !known);
}

// How to play: the rules of one way to play, picked by its chip
function showRules(way) {
  press($("rules-modes"), way);
  for (const rules of document.querySelectorAll("[data-rules]")) rules.hidden = rules.dataset.rules !== way;
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
  const guesses = guessCount(state.notes.length);
  const face = { title: "Face to face", lines: [guesses + (state.startedAt ? ` · ${formatTime(gameTime())}` : "")] };
  const now = modes.status() ?? face;
  $("now-title").textContent = now.title;
  $("now-lines").replaceChildren(...now.lines.filter(Boolean).map((line) => create("span", { textContent: line })));
  $("now-dot").className = `dot ${now.dot ?? ""}`;
  $("now-dot").hidden = now.dot === undefined; // face to face has no other phone to be connected to
  $("now-open").hidden = !now.open;
  $("now-open").textContent = now.open ?? "";
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

// What the chosen helper has settled ({ letter: "in" | "out" }), and for the advanced one the letter sets that fit.
function deduce(notes, { helper, colours }) {
  if (helper === "basic") return { known: zeroGuesses(notes) };
  if (helper === "advanced") {
    const fitting = fittingSets(notes);
    return { known: knownLetters(fitting, colours), fitting };
  }
  return { known: {} };
}

const plural = (count, noun, nouns = `${noun}s`) => `${count.toLocaleString()} ${count === 1 ? noun : nouns}`;
const guessCount = (count) => (count ? plural(count, "guess", "guesses") : "No guesses yet");

// The advanced helper's count of the words left, for the line over the scores. It never shows one.
function progress(fitting) {
  return fitting.length ? plural(wordsLeft(fitting, state.notes), "possible word") : "No word fits these scores";
}

// The game's time since New game, by the guess count on the info line; each guess shows when in it it was noted. In a
// duel the two players' clocks tick in the dock at the bottom (duel.js); the game's own time stays as it is. It stops
// at TIME_LIMIT into the game and turns red. A group game has each player's clock in its dock, and no time here.
const gameTime = () => Math.min(Date.now() - state.startedAt, TIME_LIMIT);

// The info line: your word (or the group game's room) on the left, and how the game is going on the right
function showInfo(page = modes.page()) {
  $("secret-chip").hidden = Boolean(page);
  $("room-line").hidden = !page;
  if (page) {
    $("room-line").lastElementChild.textContent = page.room;
    $("stat").textContent = `${page.letters} letters · ${guessCount(page.notes.filter((note) => !note.event).length)}`;
    return;
  }
  showChip();
  const time = state.startedAt && create("b", { textContent: formatTime(gameTime()) });
  if (time) time.classList.toggle("over", gameTime() >= TIME_LIMIT);
  $("stat").replaceChildren(...(time ? [`${guessCount(state.notes.length)} · `, time] : [guessCount(state.notes.length)]));
}

// Your word as dots, or letters once a locked one is shown, with an eye to show it, or a lock in a duel. With no word,
// an amber chip to set one; mid-duel it warns that there's none, as the page then can't check a claim on it.
function showChip() {
  const chip = $("secret-chip");
  const set = state.secret.length === 4;
  const shut = locked();
  chip.classList.toggle("warn", !set);
  if (!set) {
    const { active, started } = mode.view();
    const none = active && started;
    chip.innerHTML = none ? ALERT_ICON : PLUS_ICON;
    chip.append(none ? "No word set" : "Set your word");
    chip.ariaLabel = none ? "No word set. Set your word" : "Set your word";
    return;
  }
  const shown = shut && revealed;
  chip.innerHTML = shut ? LOCK_ICON : EYE_ICON;
  chip.prepend("Your word ", create("b", { textContent: shown ? state.secret : "••••" }));
  chip.ariaLabel = shut ? `Your word, locked until New game. ${shown ? "Hide" : "Show"} it` : "Your word, hidden. Show or change it";
}

function showMessage(text) {
  $("msg").textContent = text;
}

// The line over the scores or the group game's Guess button: whose turn it is, or what to do, with the advanced
// helper's count of the words left on its right. A message (showMessage) takes the place of its text until the guess
// changes. Written only when it changes, so a screen reader isn't told it again every second.
let barKey = "";
function showBar(page = modes.page()) {
  const line = (page ? page.line : modes.line()) ?? {};
  const start = !page && !state.notes.length && guess.length < 4;
  const text = line.text ?? (start ? "Type a guess, then tap its score" : "How many letters are right?");
  const aside = [line.aside, !page && wordsHelped].filter(Boolean).join(" · ");
  const key = JSON.stringify([text, line.tone, aside]);
  if (key === barKey) return;
  barKey = key;
  $("bar-line").className = `bar-line ${line.tone ?? ""}`;
  const mark = { over: TIME_UP_ICON, turn: '<i class="pip"></i>', mine: '<i class="pip"></i>' }[line.tone] ?? "";
  $("bar-text").innerHTML = mark;
  $("bar-text").append(text);
  $("bar-aside").textContent = aside;
}

// The guess being typed, as the guess list's last row: a tile a letter, outlined, and the next one to fill; its
// number, or in a group game "You", and a dashed score. The scores light up once it's full, on your turn, and turn
// grey on the other player's. A 4-letter game after a 5-letter one drops the guess's last letter. In a group game the
// Guess button says whose turn it is: filled once the guess can go on yours, outlined while you type, grey on someone
// else's.
function showGuess(page = modes.page()) {
  const length = page?.letters ?? 4;
  if (guess.length > length) guess = guess.slice(0, length);
  const row = TYPING;
  const [number, tileList, who, at] = row.children;
  if (tileList.children.length !== length) {
    tileList.replaceChildren(...Array.from({ length }, () => create("span")));
  }
  for (const [i, tile] of [...tileList.children].entries()) {
    tile.textContent = guess[i] ?? "";
    tile.className = `tile ${i <= guess.length ? "typed" : "blank"}`;
  }
  const notYet = page ? page.waiting : modes.turn();
  const ready = guess.length === length && !notYet;
  row.classList.toggle("ready", ready);
  number.textContent = state.notes.length + 1;
  who.textContent = !page ? "" : notYet ? "You · next" : page.last ? "You · last guess" : "You · now";
  who.classList.toggle("turn", Boolean(page && !notYet));
  at.textContent = ready ? "now" : notYet ? "next" : "";
  const typed = [...guess.toUpperCase()].join(", ");
  const scored = page ? "not guessed yet" : "not scored yet";
  row.ariaLabel = !guess ? "Your guess, empty" : ready ? `Your guess: ${guess.toUpperCase()}, ${scored}` : `Your guess so far: ${typed}`;
  $("counts").classList.toggle("ready", ready);
  $("counts").classList.toggle("waiting", Boolean(notYet));
  $("counts").ariaDisabled = String(Boolean(notYet));
  $("guess").classList.toggle("ready", ready);
  showBar(page);
  if (!page) return;
  $("guess").classList.toggle("mine", !page.waiting);
  $("guess").ariaDisabled = String(Boolean(page.waiting));
  $("guess").textContent = page.waiting || (page.last ? "Last guess" : "Guess");
}

// --- Rendering ---

function button(text, className, onPress) {
  const el = create("button", { type: "button", className, textContent: text });
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
  for (const [i, keys] of ROWS.entries()) {
    const row = create("div", { className: "row" });
    for (const letter of keys) {
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
  // A computer's own keyboard types too, unless you're typing in a box or a dialog is open. Enter keeps the secret
  // word in its panel, or notes a group game's guess, unless it's pressing another button (the page's keys and Guess
  // don't count); Escape shuts the panel.
  document.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || document.querySelector("dialog[open]")) return;
    if (viewing) return;
    if (event.target.closest("input, select, textarea")) return;
    const pressing = event.target.closest("button:not(.key, #guess)");
    if (/^[a-z]$/i.test(event.key)) type(event.key.toLowerCase());
    else if (event.key === "Backspace") backspace();
    else if (event.key === "Escape" && draft !== null) closePanel();
    else if (event.key === "Enter" && draft !== null && !pressing) keepWord();
    else if (event.key === "Enter" && modes.page() && !pressing) guessWord();
    else return;
    event.preventDefault();
  });
  $("secret-chip").addEventListener("click", tapChip);
  START.querySelector("button").addEventListener("click", openPanel);
  $("word-close").addEventListener("click", closePanel);
  $("scrim").addEventListener("click", closePanel);
  $("word-hide").addEventListener("click", () => {
    draftHidden = !draftHidden;
    showPanel();
  });
  $("word-pick").addEventListener("click", pickWord);
  $("word-done").addEventListener("click", keepWord);
  $("guess").addEventListener("click", guessWord);
  $("reset").addEventListener("click", newGame);
  $("clear").addEventListener("click", clearColours);
  $("logo").addEventListener("click", () => {
    showNow();
    $("menu").showModal();
  });
  closable($("menu"), $("close")); // or a tap on the dimmed page outside the drawer
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

// A guess in the list. Face to face and in a duel: its number, its letters to tap and mark, when in the game it was
// noted, its score and × to remove it. In a group game: its letters, who made it and its score, your own rows tinted;
// another player's winning guess shows only that they got it, until the game is over. Or a line where a player went
// out of a group game.
function noteRow(note, i, page, colour) {
  const li = create("li");
  const span = (className, textContent) => create("span", { className, textContent });
  if (note.event) {
    li.className = "event";
    li.textContent = note.event;
    return li;
  }
  li.classList.toggle("mine", Boolean(page && note.mine));
  li.classList.toggle("won", Boolean(note.won || note.hidden)); // a hidden win still shows a green tick
  if (!page) li.append(span("n", i + 1));
  const letters = note.hidden ? [span("got", "Got it")] : [...note.word].map((letter) => letterButton(letter, `tile ${colour(letter)}`));
  li.append(create("span", { className: "tiles" }));
  li.lastElementChild.append(...letters);
  if (page) li.append(span("who", note.who));
  else li.append(span("at", note.at == null ? "" : formatTime(note.at)));
  li.append(span("score", note.hidden ? "✓" : note.count));
  const word = note.hidden ? "" : note.word.toUpperCase();
  li.ariaLabel = page
    ? `${note.who}: ${note.hidden ? "got it. Their guess stays hidden until the game ends" : `${word}, ${note.count} right`}`
    : `${i + 1}. ${word}, ${note.count} right`;
  if (!page) {
    const remove = button("", "del", () => deleteNote(note));
    remove.innerHTML = DELETE_ICON;
    remove.ariaLabel = `Delete ${word}`;
    li.append(remove);
  }
  return li;
}

function render() {
  // A group game shows its table's guesses, with this phone's own colours and helper, and has no secret word
  const page = modes.page();
  const notes = page ? page.notes : state.notes;
  const { colours, helper } = book();
  $("counts").hidden = Boolean(page);
  $("guess").hidden = !page;
  $("notes").classList.toggle("group", Boolean(page));
  $("notes").classList.toggle("five", page?.letters === 5);
  $("notes").ariaLabel = page ? "Guesses, oldest first" : "Your guesses, oldest first";
  // In a group game the header's button deals, and only between games
  $("reset-new").hidden = Boolean(page);
  $("reset-deal").hidden = !page;
  $("reset").disabled = Boolean(page?.playing);
  // Advanced Helper Mode isn't offered in a group game: it would work out the word from everyone's guesses
  const advanced = $("helper").querySelector('[value="advanced"]');
  advanced.hidden = advanced.disabled = Boolean(page);
  if (page || locked()) closePanel(); // no word to set in a group game, and a duel's is locked once the clocks start
  if (!locked()) revealed = false;
  $("helper").value = helper;
  document.body.classList.toggle("dark", helper === "advanced");
  // The installed app's status or title bar follows the page into dark and back
  document.querySelector('meta[name="theme-color"]').content = getComputedStyle(document.body).getPropertyValue("--bg").trim();
  const { known, fitting } = deduce(notes.filter((note) => note.word && !note.hidden), book());
  settled = known;
  wordsHelped = fitting ? progress(fitting) : "";
  showInfo(page);
  showGuess(page);
  modes.render();
  if ($("menu").open) showNow();
  $("clear").disabled = !Object.keys(colours).length;
  const colour = (letter) => (known[letter] ? `${known[letter]} locked` : colours[letter] || "");

  for (const key of $("keyboard").querySelectorAll(".key[data-letter]")) {
    key.className = `key ${colour(key.dataset.letter)}`;
  }

  listed = notes.length;
  const items = notes.map((note, i) => noteRow(note, i, page, colour));
  // Face to face and in a duel, before a word or a guess: a card that offers to set your word
  if (!page && state.secret.length !== 4 && !notes.length) {
    const { active } = mode.view();
    const them = active ? duel.otherName(mode.view()) : "Player two";
    START.querySelector("p").textContent = `4 letters. ${them} guesses it, and only you see it.`;
    items.unshift(START);
  }
  if (page && !notes.length && !page.playing) items.push(create("li", { className: "empty", textContent: page.empty }));
  $("notes").replaceChildren(...items, TYPING);
  // The newest guess, and the one being typed, stay in sight above the scores
  if (items.length !== rows) $("notes").scrollTop = $("notes").scrollHeight;
  rows = items.length;
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
  if (page && page.notes.length !== listed) return render(); // a player ran out of time, which no phone sends
  showInfo(page); // the game's time
  showGuess(page); // a clock that ran out passes the turn with no message, and the line over the scores says so
  modes.tick();
  if ($("menu").open) showNow(); // the game's time
}, 1000);

// Keeps the files for offline use, which also lets the page be installed as an app (sw.js)
navigator.serviceWorker?.register("sw.js").catch(() => {});
