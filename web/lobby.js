// The group game's screens: the dock of 2 to 4 clocks pinned to the bottom of the page, and the sheet that drops from
// the top to set a game up, join one from a shared link, wait in the lobby and show the game while it's on. Everything
// they show comes from group.js's view(). modes.js calls render() on every change and tick() every second, shows or
// hides the dock, and goes through turn(), guess(), newGame() and page() for app.js while the group game is on.

import { ask } from "./ask.js";
import * as mode from "./group.js";
import { formatTime } from "./helpers.js";
import { cleanRoom } from "./room.js";
import { lowercase, share as shareRoom, showWins } from "./sheet.js";

const $ = (id) => document.getElementById(id);
const MINUTE = 60_000;
const MINUTES = [3, 5, 10, 15, 30]; // the chips
const SAID = 4_000; // how long what just happened stays on the dock's edge, in ms
const SCREENS = { off: "setup", lobby: "lobby", game: "game", error: "error" };
const FOOT = {
  setup: "Every phone needs internet to find the others.",
  lobby: "The letters and minutes are the same for everyone here. A game needs 2 phones.",
  game: "Leaving counts as losing this game.",
};
// Why a word can't be dealt, from group.js's deal()
const NO_DEAL = {
  on: "A game is on. Leave it to quit.",
  name: "Type your name first.",
  taken: "Someone here already has your name. Pick another one first.",
  alone: "A game needs 2 phones. Share the link with the others.",
};

let shown = ""; // the sheet's screen at the last render, so it folds away only from the lobby
let invite = ""; // the room from a shared link while the sheet asks "Join the group game?"
let sides = ""; // the players the dock's sides were last built for
let told; // what this phone has seen of the game, so each thing that happens in it is said once
let said = { text: "", at: 0 }; // what just happened, for the dock's edge

export function init() {
  $("group-menu").addEventListener("click", open);
  $("group-close").addEventListener("click", () => $("group").close());
  $("group-not-now").addEventListener("click", () => $("group").close());
  $("group").addEventListener("close", () => (invite = "")); // ×, Escape, Not now or a tap outside: nothing changes
  $("group").addEventListener("click", (event) => {
    if (event.target === $("group")) $("group").close(); // a tap on the dimmed page below the sheet
  });
  $("group-room").addEventListener("input", (event) => mode.edit("room", lowercase(event.target)));
  $("group-name").addEventListener("input", (event) => mode.edit("name", event.target.value));
  $("group-go").addEventListener("click", connect);
  $("group-start").addEventListener("click", start);
  $("group-leave").addEventListener("click", leave);
  for (const button of document.querySelectorAll("#group .share")) button.addEventListener("click", share);
  for (const minutes of MINUTES) {
    const chip = Object.assign(document.createElement("button"), { type: "button", textContent: minutes });
    chip.addEventListener("click", () => mode.setMinutes(minutes));
    $("group-chips").append(chip);
  }
  for (const letters of mode.LETTERS) {
    const chip = Object.assign(document.createElement("button"), { type: "button", textContent: `${letters} letters` });
    chip.dataset.letters = letters;
    chip.addEventListener("click", () => mode.setLetters(letters));
    $("group-letter-chips").append(chip);
  }
}

export function open() {
  if (!mode.view().active) mode.setUp();
  const v = mode.view();
  // The fields are written only here, so a render while typing never moves the cursor
  $("group-room").value = v.room || v.madeUp;
  $("group-name").value = v.name;
  showSheet(v);
  if (!$("group").open) $("group").showModal();
}

// A shared link's room (modes.js reads it) asks "Join the group game?", unless this phone is already in that room
export function invited(room) {
  const v = mode.view();
  if (v.active && v.room === room) return;
  invite = room;
  open();
}

function connect() {
  mode.connect($("group-name").value, invite || $("group-room").value);
  const v = mode.view();
  if (!v.active) return $(v.error === "room" ? "group-room" : "group-name").focus(); // a link's room is kept to try again
  invite = "";
  // The room box shows the room just tried, a link's too, so Try again and Share link on the error screen use it
  $("group-room").value = v.room;
  $("group").firstElementChild.focus(); // Connect is gone, so focus stays in the sheet
}

// Start game, or New game in the lobby: a word for everyone here
function start() {
  const why = mode.deal();
  if (why) return ask(NO_DEAL[why], { no: null });
  $("group").close();
}

function leave() {
  $("group").close();
  mode.disconnect();
}

// Another way to play was picked from the menu: mid-game, leaving counts as losing, so it asks first
export function leaving() {
  const v = mode.view();
  if (v.phase !== "game" || v.play.out[v.id]) return Promise.resolve(true);
  return ask("Leave the group game? Leaving counts as losing this game.", { yes: "Leave" });
}

// Share link sends the page's address with the room: the room being set up, from beside its field, or the one joined
function share(event) {
  const button = event.currentTarget;
  const setUp = Boolean(button.closest("#group-room-field"));
  const room = setUp ? cleanRoom($("group-room").value) : mode.view().room;
  if (!room) return $("group-room").focus();
  shareRoom(button, room, "group", "Join my group game in Word");
}

// --- What app.js asks of the group game, through modes.js ---

// Whether a guess can be noted now: "" if it can, or else why not
export function turn(v = mode.view()) {
  if (v.phase === "error") return "Not connected. Open the group game to try again";
  if (v.phase !== "game") return v.seated && v.play?.over ? "This game is over. Tap New game for another" : "Tap New game to deal a word";
  const out = v.play.out[v.id];
  if (out) return out === "time" ? "You're out of time" : "You left this game";
  if (v.play.winners.includes(v.id)) return "You got it! The others get their last guess";
  if (v.play.turn !== v.id) return `It's ${nameOf(v, v.play.turn)}'s turn`;
  return "";
}

// The phone scores a guess itself: "" once it's noted, or why it wasn't (nothing is noted and the turn isn't used)
export function guess(word) {
  const { why, who } = mode.guess(word);
  const v = mode.view();
  if (!why) return "";
  if (why === "word") return "Not in the dictionary";
  if (why === "again") return `${who === v.id ? "You" : nameOf(v, who)} already guessed ${word.toUpperCase()}`;
  return turn(v);
}

// New game deals a word, only between games. app.js never clears its own game for it.
export async function newGame() {
  const v = mode.view();
  if (v.phase === "game") await ask("A game is on. Leave it to quit.", { no: null });
  else if (v.phase !== "lobby") open();
  else if (await ask(`Deal a new ${v.letters}-letter word to everyone here?`, { yes: "Deal" })) start();
  return false;
}

// The group game has no "Your time is up" line: running out is said once, as it puts you out
export const timesUp = () => false;

// What the main page shows in a group game: the table's guesses, newest last, with who made each; another player's
// winning guess stays hidden until the game is over, as the players after them still get a last guess at the word.
// Times are from the deal. `book` is this phone's own key colours and helper for the group game. `letters` is how
// long a guess is: the game's word, or between games the next deal's.
export function page(v = mode.view()) {
  const p = v.seated ? v.play : null;
  const notes = (p?.notes ?? []).map(({ seat, word, count, at, won }) => ({
    word,
    count,
    at,
    who: seat === v.id ? "You" : nameOf(v, seat),
    hidden: won && !p.over && seat !== v.id,
  }));
  const letters = v.phase === "game" ? v.table.word.length : v.letters;
  return { book: mode.book(), notes, letters, time: p && { game: p.time, turn: p.running, over: p.over } };
}

// --- Drawing ---

export function render(v = mode.view()) {
  showSheet(v);
  draw(v);
}

// Every second: a game that's over is recorded and an away player skipped (group.js), then the clocks are drawn
export function tick() {
  mode.watch();
  const v = mode.view();
  if ($("group").open) showSheet(v); // the players' times and countdowns
  draw(v);
}

function draw(v) {
  announce(v);
  if (!v.active) return;
  const p = v.seated ? v.play : null;
  const players = p ? v.table.seats : v.lobby.slice(0, mode.SEATS);
  buildSides(players);
  for (const side of $("group-dock").querySelectorAll(".side")) {
    const { id } = side.dataset;
    const name = id === v.id ? "You" : nameOf(v, id);
    const left = p ? p.left[id] : v.minutes * MINUTE;
    side.firstElementChild.textContent = name;
    side.lastElementChild.textContent = time(left);
    side.classList.toggle("running", Boolean(p && p.turn === id));
    side.classList.toggle("over", Boolean(p?.out[id]));
    side.classList.toggle("won", Boolean(p?.winners.includes(id)));
    side.classList.toggle("idle", v.phase === "error" || (Boolean(p) && Object.hasOwn(v.away, id)));
    side.ariaLabel = `${name}: ${statusOf(v, id) || "waiting"}, ${time(left)}`;
  }
  const alone = v.lobby.length < 2;
  $("group-menu").lastElementChild.className = `dot ${v.phase === "error" ? "" : alone ? "wait" : "live"}`;
  showNote(edgeNote(v, Date.now()));
}

// One side a player, in turn order (or the lobby's, between games), built again only when the players change
function buildSides(players) {
  const key = JSON.stringify(players.map(({ id }) => id));
  if (key === sides) return;
  sides = key;
  for (const side of $("group-dock").querySelectorAll(".side")) side.remove();
  for (const { id } of players) {
    const side = Object.assign(document.createElement("div"), { className: "side", role: "timer" });
    side.dataset.id = id;
    side.append(document.createElement("span"), document.createElement("b"));
    $("group-menu").before(side);
  }
  $("group-dock").classList.toggle("many", players.length > 2);
}

// The line on the dock's top edge: what just happened for a few seconds, else who dropped out with the time they have
// to come back, else whose free first guess it is, or who's in the lobby
function edgeNote(v, now) {
  if (v.phase === "error") return { text: problem(v), warn: true };
  if (now - said.at < SAID) return said;
  if (v.phase === "game") {
    const { turn: id, free } = v.play;
    if (Object.hasOwn(v.away, id)) return { text: `${nameOf(v, id)} dropped out · ${time(v.away[id])}`, dot: "wait", warn: true };
    if (free) return { text: `${id === v.id ? "Your" : `${nameOf(v, id)}'s`} first guess is free`, dot: "live" };
    return { text: "" };
  }
  if (v.lobby.length < 2) return { text: "Waiting for others to join…", dot: "wait" };
  return { text: `${v.lobby.length} here · ${v.letters} letters · tap New game to deal`, dot: "live" };
}

function showNote({ text, dot = "", warn = false }) {
  const el = $("group-note");
  el.hidden = !text;
  el.classList.toggle("warn", warn);
  el.firstElementChild.className = `dot ${dot}`;
  el.lastElementChild.textContent = text;
}

// What happens in the game, said once on this phone: your own news and the game's end in a note (ask.js), the other
// players' on the dock's edge, not in a queue of notes
function announce(v) {
  const p = v.seated ? v.play : null;
  const now = { game: v.table?.game ?? "", winners: p?.winners.length ?? 0, over: p?.over ?? false, out: { ...p?.out }, skips: skips(p) };
  const before = told;
  told = now;
  if (!before || !v.active || !p) return; // the game as it was on loading the page has been said already
  if (now.game !== before.game) {
    return say(`${v.table.dealer === v.id ? "You" : nameOf(v, v.table.dealer)} dealt a new ${v.table.word.length}-letter word`);
  }
  for (const [id, reason] of Object.entries(p.out)) {
    if (!before.out[id] && id !== v.id) say(`${nameOf(v, id)} ${reason === "time" ? "ran out of time" : "left the game"}`);
  }
  if (now.skips > before.skips) say(`${nameOf(v, p.moves.findLast((move) => move.kind === "skip").seat)}'s turn was skipped`);
  if (p.over && !before.over) return ending(v);
  if (p.out[v.id] === "time" && !before.out[v.id]) ask("Your time is up. You're out of this game.", { no: null });
  if (now.winners && !before.winners) gotIt(v);
}

const skips = (p) => p?.moves.filter((move) => move.kind === "skip").length ?? 0;

function say(text) {
  said = { text, at: Date.now() };
}

// Someone got the word: the players after them in the round get one last guess
function gotIt(v) {
  const p = v.play;
  const who = p.winners[0] === v.id ? "You" : nameOf(v, p.winners[0]);
  const rest = names(v, p.lastGuesses);
  const verb = rest.length === 1 && rest[0] !== "you" ? "gets" : "get";
  ask(`${who} got it! ${capital(listed(rest))} ${verb} one last guess.`, { no: null });
}

function ending(v) {
  const p = v.play;
  const winners = names(v, p.winners);
  let text = Object.values(p.out).every((reason) => reason === "time") ? "Time's up for everyone. Nobody got it." : "Nobody got it.";
  if (winners.length === 1) text = winners[0] === "you" ? "You win!" : `${winners[0]} wins!`;
  if (winners.length > 1) text = `${capital(listed(winners))} ${winners.length === 2 ? "both" : "all"} got it: a draw.`;
  ask(`${text} The word was`, { no: null, word: v.table.word });
}

// The players' names, "you" first if you're one of them
const names = (v, ids) => [...ids].sort((a, b) => (b === v.id) - (a === v.id)).map((id) => (id === v.id ? "you" : nameOf(v, id)));

// Ben, Cleo and Dev
const listed = (names) => (names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? ""));
const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);

// A seat's name, or a lobby phone's
const nameOf = (v, id) => (v.table?.seats.find((seat) => seat.id === id) ?? v.lobby.find((phone) => phone.id === id))?.name || "?";

// How a player is doing in the game, in a word or two, or their time left
function statusOf(v, id) {
  const p = v.seated ? v.play : null;
  if (!p) return "";
  if (p.out[id]) return p.out[id] === "time" ? "out of time" : "left";
  if (p.winners.includes(id)) return "got it";
  if (Object.hasOwn(v.away, id) && !p.over) return `away ${time(v.away[id])}`;
  if (p.turn === id) return "playing";
  return "";
}

// Rounded up: 0:00 only once the time is really gone
const time = (ms) => formatTime(ms + 999);

// What went wrong, in the sheet's words
function problem(v) {
  if (v.phase === "lobby" && !v.name) return "Type your name: the wins are kept by name.";
  if (v.phase === "lobby" && v.taken) return `Someone here is already called ${v.name}. Pick another name.`;
  return (
    {
      room: "Type a room name",
      name: "Type your name: the wins are kept by name.",
      https: "The group game needs the https site.",
      join: `Couldn't join ${v.room}. Check this phone is online and try again.`,
      full: "This room is full.",
      busy: "A game is on in this room. Try again when it ends.",
    }[v.error] ?? ""
  );
}

// The players in the lobby or the game: a dot for whether they're here, the name, and how they're doing
function showPlayers(v, screen) {
  const game = screen === "game";
  const players = game ? v.table.seats : v.lobby;
  const rows = players.map(({ id, name }) => {
    const li = document.createElement("li");
    const away = game && Object.hasOwn(v.away, id);
    const status = game ? statusOf(v, id) || time(v.play.left[id]) : v.lobby.find((phone) => phone.id === id)?.taken ? "name taken" : "";
    li.classList.toggle("me", id === v.id);
    li.classList.toggle("turn", game && v.play.turn === id);
    li.classList.toggle("out", game && Boolean(v.play.out[id]));
    li.append(
      Object.assign(document.createElement("i"), { className: `dot ${away ? "wait" : "live"}`, ariaHidden: "true" }),
      Object.assign(document.createElement("span"), { textContent: id === v.id ? `${name || "You"} (you)` : name }),
      Object.assign(document.createElement("em"), { textContent: status }),
    );
    return li;
  });
  $("group-players").replaceChildren(...rows);
}

// The sheet shows one of five screens, the room's name on each (in its field, the link's note or under the title). It
// folds away by itself when a word is dealt while it shows the lobby.
function showSheet(v) {
  const screen = invite ? "join" : SCREENS[v.phase];
  if (shown === "lobby" && screen === "game") $("group").close();
  shown = screen;
  const showOn = (id, ...screens) => ($(id).hidden = !screens.includes(screen));
  const naming = screen === "lobby" && (!v.name || v.taken); // the lobby asks for another name
  $("group-title").textContent = screen === "join" ? "Join the group game?" : "Group game";
  showOn("group-intro", "setup");
  showOn("group-invite", "join");
  showOn("group-here", "lobby", "game");
  showOn("group-room-field", "setup", "error");
  showOn("group-room-hint", "setup");
  showOn("group-in-room", "lobby", "game");
  $("group-name-field").hidden = !["setup", "join"].includes(screen) && !naming;
  showOn("group-minutes", "setup", "lobby");
  showOn("group-letters", "setup", "lobby", "game"); // during a game, for the next one
  showOn("group-go", "setup", "join", "error");
  showOn("group-start", "lobby");
  showOn("group-not-now", "join");
  showOn("group-wins", "lobby", "game");
  showOn("group-end", "lobby", "game", "error");
  showOn("group-share", "lobby", "game");
  $("group-invite").firstElementChild.textContent = invite;
  $("group-in-room").lastElementChild.textContent = v.room;
  const error = problem(v);
  $("group-error").hidden = !error || (screen === "join" && v.error !== "name"); // the link's room is a new start
  if ($("group-error").textContent !== error) $("group-error").textContent = error; // an alert: said again only when new
  $("group-go").textContent = { error: "Try again", join: "Join game" }[screen] ?? "Connect";
  $("group-leave").textContent = screen === "error" ? "Back to face to face" : "Leave";
  $("group-leave").classList.toggle("danger", screen !== "error");
  const out = screen === "game" && v.play.out[v.id];
  $("group-foot").textContent = out ? "You're out of this game. Stay to watch it end, or leave." : (FOOT[screen] ?? "");
  $("group-foot").hidden = !$("group-foot").textContent;
  $("group-here-label").textContent = screen === "game" ? "Players" : `Here (${v.lobby.length} of ${mode.SEATS})`;
  $("group-letters-label").textContent = screen === "game" ? "Letters in the next word" : "Letters in the word";
  if (screen === "lobby" || screen === "game") showPlayers(v, screen);
  showWins($("group-wins-list"), $("group-wins-when"), v.board, v.name, v.playedAt);
  for (const chip of $("group-chips").children) chip.ariaPressed = String(Number(chip.textContent) === v.minutes);
  for (const chip of $("group-letter-chips").children) chip.ariaPressed = String(Number(chip.dataset.letters) === v.letters);
}
