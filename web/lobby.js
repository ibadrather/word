// The group game's screens: the dock of 2 to 4 clocks pinned to the bottom of the page, and the sheet that drops from
// the top to set a game up, join one from a shared link, wait in the lobby and show the game while it's on. Everything
// they show comes from group.js's view(). modes.js calls render() on every change and tick() every second, shows or
// hides the dock, and goes through turn(), guess(), newGame() and page() for app.js while the group game is on.

import { ask } from "./ask.js";
import { $, create } from "./dom.js";
import * as mode from "./group.js";
import { MINUTE, loadMeanings, meaningOf } from "./helpers.js";
import { cleanRoom } from "./room.js";
import {
  MINUTE_CHIPS,
  addChips,
  clockTime as time,
  closable,
  lowercase,
  press,
  share as shareRoom,
  showEdgeNote,
  showWins,
  winsLine,
} from "./sheet.js";

const SAID = 4_000; // how long what just happened stays on the dock's edge, in ms
const SCREENS = { off: "setup", lobby: "lobby", game: "game", error: "error" };
const FOOT = {
  setup: "Every phone needs internet to find the others.",
  lobby: "Anyone here can change the letters and minutes. Whoever deals goes first.",
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
  closable($("group"), $("group-close"), $("group-not-now"));
  $("group").addEventListener("close", () => (invite = "")); // ×, Escape, Not now or a tap outside: nothing changes
  $("group-room").addEventListener("input", (event) => mode.edit("room", lowercase(event.target)));
  $("group-name").addEventListener("input", (event) => mode.edit("name", event.target.value));
  $("group-go").addEventListener("click", connect);
  $("group-start").addEventListener("click", start);
  $("group-leave").addEventListener("click", leave);
  for (const button of document.querySelectorAll("#group .share")) button.addEventListener("click", share);
  addChips($("group-chips"), MINUTE_CHIPS, mode.setMinutes);
  addChips($("group-letter-chips"), mode.LETTERS, mode.setLetters, (letters) => `${letters} letters`);
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

// Deal, from the lobby or the page's header: a word for everyone here
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
  return ask("Leave the group game? Leaving counts as losing this game.", { yes: "Leave", danger: true });
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
export const turn = (v = mode.view()) => notYours(v).long;

// Why this phone can't guess now, in a few words for the Guess button and at length for under it when it's tapped, or
// "" for both when it can
function notYours(v) {
  const words = (short, long = short) => ({ short, long });
  if (v.phase === "error") return words("Not connected", "Not connected. Open the group game to try again");
  if (v.phase !== "game") {
    if (v.seated && v.play?.over) return words("Game over · tap Deal", "This game is over. Tap Deal for another");
    return words("No game yet · tap Deal", "Tap Deal for a word");
  }
  const out = v.play.out[v.id];
  if (out) return words(out === "time" ? "You're out of time" : "You left this game");
  if (v.play.winners.includes(v.id)) return words("You got it!", "You got it! The others get their last guess");
  const name = nameOf(v, v.play.turn);
  if (v.play.turn !== v.id) return words(`${name}'s turn`, `It's ${name}'s turn`);
  return words("");
}

// The menu's "Now playing" card: the room, who's here, how the game is going and the room's wins (modes.js)
export function status(v = mode.view()) {
  const letters = v.phase === "game" ? v.table.word.length : v.letters;
  const where = v.phase === "error" ? `Room ${v.room}` : `Room ${v.room} · ${v.lobby.length} here · ${letters} letters`;
  const doing = v.phase === "error" ? problem(v) : notYours(v).short || "Your turn";
  const dot = v.phase === "error" ? "" : v.lobby.length < 2 ? "wait" : "live";
  return { title: "Group game", lines: [where, doing, winsLine(v.board, v.name)], dot, open: "Open the room" };
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

// The header's Deal deals a word, only between games (app.js turns it off during one). app.js never clears its own
// game for it.
export async function newGame() {
  const v = mode.view();
  if (v.phase !== "lobby") open();
  else if (await ask(`Deal a new ${v.letters}-letter word to everyone here?`, { yes: "Deal" })) start();
  return false;
}

// What the main page shows in a group game: the table's guesses, oldest first, with who made each, and where a player
// ran out of time or left; another player's winning guess stays hidden until the game is over, as the players after
// them still get a last guess at the word. `book` is this phone's own key colours and helper for the group game.
// `letters` is how long a guess is: the game's word, or between games the next deal's. `room` is the room joined.
// `waiting` is what the Guess button says when it isn't this phone's turn ("" when it is), `last` that this phone's
// turn is its last guess, `line` the line over the button ({ text, tone }), `playing` that a game is on, so the
// header's Deal can't be used, and `empty` what the guess list says before a deal.
export function page(v = mode.view()) {
  const p = v.seated ? v.play : null;
  const letters = v.phase === "game" ? v.table.word.length : v.letters;
  const { short, long } = notYours(v);
  const empty = v.phase === "error" ? `${long}.` : "No game yet. Tap Deal for a word."; // the guess list, before a deal
  const last = Boolean(p?.winners.length && p.lastGuesses.includes(v.id));
  const line = lineFor(v);
  return { book: mode.book(), notes: p ? notes(v, p) : [], letters, room: v.room, waiting: short, last, line, playing: v.phase === "game", empty };
}

// The game's guesses and players going out, in the order they happened: { word, count, at, who, mine, won, hidden } a
// guess, { event } a player out. A player who tapped Leave off their turn is out from the move they left at.
function notes(v, p) {
  const out = (id, reason) => {
    const [who, verb] = id === v.id ? ["You", "are"] : [nameOf(v, id), "is"];
    return { event: reason === "time" ? `${who} ran out of time and ${verb} out` : `${who} left the game` };
  };
  const quits = Object.entries(v.table.quit ?? {}).filter(([id]) => p.out[id] === "left");
  const quitAt = (i) => quits.filter(([, at]) => at === i).map(([id]) => out(id, "left"));
  const list = [];
  let guesses = 0;
  for (const [i, move] of p.moves.entries()) {
    list.push(...quitAt(i));
    if (move.kind === "time" || move.kind === "leave") list.push(out(move.seat, move.kind === "time" ? "time" : "left"));
    if (move.kind !== "guess") continue;
    const { seat, word, count, at, won } = p.notes[guesses++];
    const hidden = won && !p.over && seat !== v.id;
    list.push({ word, count, at, who: seat === v.id ? "You" : nameOf(v, seat), mine: seat === v.id, won: won && !hidden, hidden });
  }
  list.push(...quits.filter(([, at]) => at >= p.moves.length).map(([id]) => out(id, "left")));
  return list;
}

// The line over the Guess button, from this phone's side: { text, tone }, the tone "mine" on this phone's turn and
// "won" once someone has got the word
function lineFor(v) {
  if (v.phase !== "game") return { text: `${notYours(v).long}.` };
  const p = v.play;
  if (p.out[v.id]) return { text: "You're out of this game. Stay to watch it end, or leave." };
  if (p.winners.includes(v.id)) return { text: "You got it! The others get their last guess.", tone: "won" };
  if (p.winners.length) {
    const who = nameOf(v, p.winners[0]);
    if (!p.lastGuesses.includes(v.id)) return { text: `${who} got it! The others get their last guess.`, tone: "won" };
    const which = p.turn === v.id ? "this" : "your";
    return { text: `${who} got it! Get it too on ${which} last guess and it's a draw.`, tone: "won" };
  }
  if (p.turn === v.id) return { text: "Your turn. The page scores it for everyone.", tone: "mine" };
  return { text: "Type your next guess while you wait." };
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
  // A phone that couldn't join, or was turned away, has no clock here: the dock only says why
  const players = v.phase === "error" ? [] : p ? v.table.seats : v.lobby.slice(0, mode.SEATS);
  buildSides(players);
  for (const side of $("group-dock").querySelectorAll(".side")) {
    const { id } = side.dataset;
    const name = id === v.id ? "You" : nameOf(v, id);
    const left = p ? p.left[id] : v.minutes * MINUTE;
    side.firstElementChild.textContent = name;
    side.lastElementChild.textContent = p?.out[id] ? "Out" : p?.winners.includes(id) ? "Got it" : time(left);
    side.classList.toggle("running", Boolean(p && p.turn === id));
    side.classList.toggle("over", Boolean(p?.out[id]));
    side.classList.toggle("won", Boolean(p?.winners.includes(id)));
    side.classList.toggle("idle", v.phase === "error" || (Boolean(p) && Object.hasOwn(v.away, id)));
    side.ariaLabel = `${name}: ${statusOf(v, id) || "waiting"}, ${time(left)}`;
  }
  const alone = v.lobby.length < 2;
  $("group-menu").lastElementChild.className = `dot ${v.phase === "error" ? "" : alone ? "wait" : "live"}`;
  showEdgeNote($("group-note"), edgeNote(v, Date.now()));
}

// One side a player, in turn order (or the lobby's, between games), built again only when the players change
function buildSides(players) {
  const key = JSON.stringify(players.map(({ id }) => id));
  if (key === sides) return;
  sides = key;
  for (const side of $("group-dock").querySelectorAll(".side")) side.remove();
  for (const { id } of players) {
    const side = create("div", { className: "side", role: "timer" });
    side.dataset.id = id;
    side.append(create("span"), create("b"));
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
  return { text: `${v.lobby.length} here · ${v.letters} letters · tap Deal`, dot: "live" };
}

// What happens in the game, said once on this phone: your own news and the game's end in a note (ask.js), the other
// players' on the dock's edge, not in a queue of notes
function announce(v) {
  const p = v.seated ? v.play : null;
  const now = {
    game: v.table?.game ?? "",
    winners: p?.winners.length ?? 0,
    over: p?.over ?? false,
    out: { ...p?.out },
    skips: skips(p),
    letters: v.letters,
    minutes: v.minutes,
    picked: v.picked,
    pickedBy: v.pickedBy,
    here: v.lobby.map(({ id }) => id),
  };
  const before = told;
  told = now;
  if (before && v.active) switched(v, before);
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

// Another phone here changed the letters or the minutes: said on the dock's edge, so nobody is caught out by a change
// they didn't make. It's said only for a new pick by a phone that was here already: a phone just joined takes up the
// room's choice from the others, which says nothing.
function switched(v, before) {
  if (v.picked === before.picked && v.pickedBy === before.pickedBy) return;
  const changes = [v.letters !== before.letters && `${v.letters} letters`, v.minutes !== before.minutes && `${v.minutes} minutes each`];
  const by = before.here.includes(v.pickedBy) && v.lobby.find(({ id, me }) => !me && id === v.pickedBy);
  if (!by || !changes.some(Boolean)) return;
  const next = v.phase === "game" ? " for the next word" : "";
  say(`${by.name || "Someone"} switched to ${changes.filter(Boolean).join(" and ")}${next}`);
}

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
  ask(`${text} The word was`, { no: null, word: v.table.word, meaning: meaningFor(v.table.word) });
}

// The word's brief meaning, or "" for a word without one
const meaningFor = (word) => loadMeanings().then((meanings) => meaningOf(meanings, word));

// The players' names, "you" first if you're one of them
const names = (v, ids) => [...ids].sort((a, b) => (b === v.id) - (a === v.id)).map((id) => (id === v.id ? "you" : nameOf(v, id)));

// Ben, Cleo and Dev
const listed = (list) => (list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list.at(-1)}` : (list[0] ?? ""));
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

// The players in the lobby or the game: a dot for whether they're here, the name, and how they're doing. In a game
// they're numbered in turn order, which is the dealer first and so isn't the lobby's.
function showPlayers(v, screen) {
  const game = screen === "game";
  const players = game ? v.table.seats : v.lobby;
  const rows = players.map(({ id, name }, i) => {
    const li = create("li");
    const away = game && Object.hasOwn(v.away, id);
    const doing = game ? statusOf(v, id) || time(v.play.left[id]) : v.lobby.find((phone) => phone.id === id)?.taken ? "name taken" : "";
    li.classList.toggle("me", id === v.id);
    li.classList.toggle("turn", game && v.play.turn === id);
    li.classList.toggle("out", game && Boolean(v.play.out[id]));
    if (game) li.append(create("small", { className: "seat", textContent: i + 1 }));
    li.append(
      create("i", { className: `dot ${away ? "wait" : "live"}`, ariaHidden: "true" }),
      create("span", { textContent: id === v.id ? `${name || "You"} (you)` : name }),
      create("em", { textContent: doing }),
    );
    return li;
  });
  $("group-players").replaceChildren(...rows);
}

// The sheet shows one of five screens, the room's name on each (in its field, the link's note, the waiting box or
// under the title). Alone in the lobby, the room is shown big to invite the others, and Deal waits for them. It folds
// away by itself when a word is dealt while it shows the lobby.
function showSheet(v) {
  const screen = invite ? "join" : SCREENS[v.phase];
  if (shown === "lobby" && screen === "game") $("group").close();
  shown = screen;
  const showOn = (id, ...screens) => ($(id).hidden = !screens.includes(screen));
  const naming = screen === "lobby" && (!v.name || v.taken); // the lobby asks for another name
  const alone = screen === "lobby" && v.lobby.length < 2;
  $("group-title").textContent = screen === "join" ? "Join the group game?" : "Group game";
  showOn("group-intro", "setup");
  showOn("group-invite", "join");
  showOn("group-here", "lobby", "game");
  showOn("group-room-field", "setup", "error");
  showOn("group-room-share", "setup"); // a room that turned this phone away isn't one to send
  showOn("group-room-hint", "setup");
  $("group-wait").hidden = !alone;
  $("group-in-room").hidden = alone || !["lobby", "game"].includes(screen);
  showOn("group-share", "lobby"); // mid-game, a phone that joins is turned away
  $("group-name-field").hidden = !["setup", "join"].includes(screen) && !naming;
  // Picked in the room, so a pick is never lost to the choice of the phones already there
  showOn("group-minutes", "lobby");
  showOn("group-letters", "lobby", "game"); // during a game, for the next one
  showOn("group-go", "setup", "join", "error");
  showOn("group-start", "lobby");
  showOn("group-not-now", "join");
  showOn("group-leave", "lobby", "game", "error");
  showOn("group-wins", "lobby", "game");
  $("group-invite").firstElementChild.textContent = invite;
  $("group-wait").querySelector(".room-big").textContent = v.room;
  $("group-in-room").querySelector("b").textContent = v.room;
  const error = problem(v);
  $("group-error").hidden = !error || (screen === "join" && v.error !== "name"); // the link's room is a new start
  if ($("group-error").textContent !== error) $("group-error").textContent = error; // an alert: said again only when new
  $("group-go").textContent = { error: "Try again", join: "Join game" }[screen] ?? "Connect";
  // A name first: the wins are kept by it. Try again keeps the name it tried.
  $("group-go").disabled = screen !== "error" && !$("group-name").value.trim();
  $("group-start").textContent = alone ? "Waiting for 1 more…" : "Start game";
  $("group-start").disabled = alone;
  $("group-leave").textContent = screen === "error" ? "Back to face to face" : "Leave";
  $("group-leave").classList.toggle("danger", screen !== "error");
  const out = screen === "game" && v.play.out[v.id];
  $("group-foot").textContent = out ? "You're out of this game. Stay to watch it end, or leave." : (FOOT[screen] ?? "");
  $("group-foot").hidden = !$("group-foot").textContent;
  $("group-here-label").textContent = screen === "game" ? "Turn order" : `Players (${v.lobby.length} of ${mode.SEATS})`;
  $("group-letters-label").textContent = screen === "game" ? "Letters in the next word" : "Letters in the word";
  if (screen === "lobby" || screen === "game") showPlayers(v, screen);
  showWins($("group-wins-list"), $("group-wins-when"), v.board, v.name, v.playedAt);
  press($("group-chips"), v.minutes);
  press($("group-letter-chips"), v.letters);
}
