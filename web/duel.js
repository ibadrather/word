// The duel clock's screens: the dock of two clocks pinned to the bottom of the page, like a real chess clock, and the
// sheet that drops from the top to set the duel up, to join one from a shared link and to show it while it's on.
// Everything they show comes from clock.js's view(). modes.js calls render() on every change and tick() every second,
// shows or hides the dock, and goes through turn(), note() and newGame() for app.js while the duel is on.

import { ask } from "./ask.js";
import * as mode from "./clock.js";
import { formatTime } from "./helpers.js";
import { cleanRoom } from "./room.js";
import { lowercase, share as shareRoom, showWins } from "./sheet.js";
import { playerName } from "./wins.js";

const $ = (id) => document.getElementById(id);
const JOINED_NOTE = 4_000; // how long "… joined" stays on the dock's edge, in ms
const SIDES = ["mine", "theirs"];
const MINUTES = [3, 5, 10, 15, 30]; // the chips; minutes off this list (an older save, or sent) light none and are kept
const SCREENS = { off: "setup", waiting: "waiting", live: "connected", dropped: "connected", left: "connected", error: "error" };
const DOTS = { live: "live", left: "" }; // the dot for each phase: green, hollow and still, or else hollow and pulsing
const dotFor = (phase) => DOTS[phase] ?? "wait";
// What the dock's edge and the sheet say about the other player, by phase
const STATUS = {
  live: (who) => `${who} is connected`,
  dropped: (who) => `${who} dropped out · reconnecting…`,
  left: (who) => `${who} left the duel`,
};

let labelled = ""; // what the clocks' labels were last written for, so they change with the turn, not every tick
let shown = ""; // the sheet's screen at the last render, so it folds away only from Waiting
let invite = ""; // the room from a shared link while the sheet asks "Join the duel?"

export function init() {
  $("dock-menu").addEventListener("click", open);
  $("duel-close").addEventListener("click", () => $("duel").close());
  $("duel-not-now").addEventListener("click", () => $("duel").close());
  $("duel").addEventListener("close", () => (invite = "")); // ×, Escape, Not now or a tap outside: nothing changes
  $("duel").addEventListener("click", (event) => {
    if (event.target === $("duel")) $("duel").close(); // a tap on the dimmed page below the sheet
  });
  $("duel-room").addEventListener("input", typeRoom);
  $("duel-name").addEventListener("input", (event) => mode.edit("name", event.target.value));
  $("duel-go").addEventListener("click", connect);
  $("duel-leave").addEventListener("click", leave);
  $("wins-undo").addEventListener("click", undoWin);
  for (const button of document.querySelectorAll("#duel .share")) button.addEventListener("click", share);
  for (const minutes of MINUTES) {
    const chip = Object.assign(document.createElement("button"), { type: "button", textContent: minutes });
    chip.addEventListener("click", () => setMinutes(minutes));
    $("chips").append(chip);
  }
}

// New minutes restart both clocks, so it asks first while a game is going on them
async function setMinutes(minutes) {
  const v = mode.view();
  const asking = v.active && v.inPlay && minutes !== v.minutes;
  if (asking && !(await ask(`Restart both clocks with ${minutes} minutes?`, { yes: "Restart" }))) return;
  mode.setMinutes(minutes);
}

export function open() {
  if (!mode.view().active) mode.setUp();
  const v = mode.view();
  // The fields are written only here, so a render while typing never moves the cursor
  $("duel-room").value = v.room || v.madeUp;
  $("duel-name").value = v.name;
  showJoining();
  showSheet(v);
  if (!$("duel").open) $("duel").showModal();
}

// A shared link's room (modes.js reads it) asks "Join the duel?", unless this phone is already in that room
export function invited(room) {
  const v = mode.view();
  if (v.active && v.room === room) return;
  invite = room;
  open();
}

function typeRoom(event) {
  mode.edit("room", lowercase(event.target));
  showJoining();
}

// A link's room, or one typed over the made-up one, is someone else's to join: the name's default and the last hint
// say so
function showJoining() {
  const joining = Boolean(invite) || $("duel-room").value.trim() !== mode.view().madeUp;
  $("duel-name").placeholder = playerName(joining ? 1 : 0);
  $("duel-foot").textContent = joining
    ? "Joining? Your minutes give way to the other phone's."
    : "Both phones need internet to find each other.";
}

function connect() {
  const [room, joining] = [invite || $("duel-room").value, Boolean(invite)];
  invite = "";
  mode.connect($("duel-name").value, room, joining); // a link's room is joined, never hosted
  // The room box shows the room just tried, a link's too, so Try again and Share link on the error screen use it
  const v = mode.view();
  if (v.active) $("duel-room").value = v.room;
  if ($("duel-go").hidden) $("duel").firstElementChild.focus(); // the button is gone, so focus stays in the sheet
}

function leave() {
  $("duel").close();
  mode.disconnect();
}

// Another way to play was picked from the menu: the duel is left without asking
export const leaving = () => Promise.resolve(true);

// Share link sends the page's address with the room: the room being set up, from beside its field, or the one joined
function share(event) {
  const button = event.currentTarget;
  const setUp = Boolean(button.closest("#duel-room-field"));
  const room = setUp ? cleanRoom($("duel-room").value) : mode.view().room;
  if (!room) return $("duel-room").focus();
  shareRoom(button, room, "room", "Join my duel clock in Word");
}

export function render(v = mode.view()) {
  const idle = ["waiting", "error", "left"].includes(v.phase); // nobody there to play against
  for (const which of SIDES) $(which).classList.toggle("idle", idle);
  $("theirs").firstElementChild.textContent = otherName(v);
  $("dock-menu").lastElementChild.className = `dot ${dotFor(v.phase)}`;
  showSheet(v);
  tick(v);
}

// The times, which side runs or has run out, and the note on the dock's edge
export function tick(v = mode.view()) {
  if (!v.active) return;
  for (const which of SIDES) {
    $(which).lastElementChild.textContent = time(v[which].left);
    $(which).classList.toggle("running", v[which].running);
    $(which).classList.toggle("over", v[which].left === 0);
  }
  label(v);
  showNote(edgeNote(v, Date.now()));
}

// My own time has run out: modes.js shows "Your time is up" above the guess
export const timesUp = (v = mode.view()) => v.active && v.mine.left === 0;

// A guess can be noted unless the other player's clock is running: "" if it can, or else why not
export const turn = (v = mode.view()) => (v.myTurn ? "" : `It's ${otherName(v)}'s turn`);

// A guess was noted: my clock stops and the other player's starts
export function note() {
  mode.press();
}

// New game restarts both clocks too: that's the only way to change a word once the game is on. Whether app.js should
// clear its game.
export async function newGame() {
  if (!(await ask("Clear your word, guesses and key colours, and restart both clocks?", { yes: "New game" }))) return false;
  mode.newGame(); // tells the other phone too
  return true;
}

// The host's other player is player two, and the other way round, until their phone sends a name
export const otherName = (v) => v.peerName || playerName(v.host ? 1 : 0);

// The last win in this room, from this phone's side: `theirs` words the other player's
export const lastWin = (v, theirs = `${otherName(v)}'s win`) => (v.last.side === "mine" ? "your win" : theirs);

// A win can be undone after a mistake, like a wrong score or a "Yes" tapped by accident, but only if the other player
// agrees on their phone (app.js asks them)
export async function undoWin() {
  const v = mode.view();
  if (!v.last || v.phase !== "live") return;
  const them = otherName(v);
  if (await ask(`Undo ${lastWin(v)} so it doesn't count? ${them} has to agree on their phone.`, { yes: `Ask ${them}` })) {
    mode.send({ type: "undo" });
  }
}
const waitingFor = (v) => `Waiting for ${playerName(v.host ? 1 : 0).toLowerCase()}…`;

// What went wrong, in the sheet's words
const problem = (v) =>
  ({
    room: "Type a room name",
    https: "The duel clock needs the https site.",
    join: `Couldn't join ${v.room}. Check this phone is online and try again.`,
  })[v.error] ?? "";

// Rounded up: 0:00 only once the time is really gone
const time = (ms) => formatTime(ms + 999);

// What a screen reader hears for each clock, written again when the turn, a stopped time or a name changes
function label(v) {
  const key = JSON.stringify([otherName(v), ...SIDES.map((which) => v[which].running || v[which].left)]);
  if (key === labelled) return;
  labelled = key;
  const state = (side) => (side.running ? "running" : side.left ? "stopped" : "out of time");
  $("mine").ariaLabel = `Your clock, ${state(v.mine)}, ${time(v.mine.left)}`;
  $("theirs").ariaLabel = `${otherName(v)}'s clock, ${state(v.theirs)}, ${time(v.theirs.left)}`;
}

// The line on the dock's top edge: its text, its dot ("live", "wait" or "" for hollow) and whether it's a warning
function edgeNote(v, now) {
  if (v.phase === "waiting") return { text: waitingFor(v), dot: "wait" };
  if (v.phase === "error") return { text: v.error === "join" ? `Couldn't join ${v.room}` : problem(v), warn: true };
  if (v.phase === "dropped") return { text: STATUS.dropped(otherName(v)), dot: "wait", warn: true };
  if (v.phase === "left") return { text: STATUS.left(otherName(v)) };
  if (now - v.joinedAt < JOINED_NOTE) {
    return { text: `${otherName(v)} joined${v.started ? "" : " · first guess is free"}`, dot: "live" };
  }
  return { text: "" };
}

function showNote({ text, dot = "", warn = false }) {
  const el = $("dock-note");
  el.hidden = !text;
  el.classList.toggle("warn", warn);
  el.firstElementChild.className = `dot ${dot}`;
  el.lastElementChild.textContent = text;
}

// The sheet shows one of five screens. It folds away by itself when the other phone arrives while it shows Waiting,
// but stays put when opened mid-game to look at the minutes.
function showSheet(v) {
  const screen = invite ? "join" : SCREENS[v.phase];
  if (shown === "waiting" && screen === "connected") $("duel").close();
  shown = screen;
  const showOn = (id, ...screens) => ($(id).hidden = !screens.includes(screen));
  $("duel-title").textContent = screen === "join" ? "Join the duel?" : "Duel clock";
  showOn("duel-intro", "setup");
  showOn("duel-invite", "join");
  showOn("duel-wait", "waiting");
  showOn("duel-live", "connected");
  showOn("duel-wins", "waiting", "connected");
  showOn("duel-room-field", "setup", "error");
  showOn("duel-room-hint", "setup");
  showOn("duel-name-field", "setup", "join");
  showOn("duel-minutes", "setup", "waiting", "connected", "error"); // a joiner takes the other phone's
  showOn("duel-go", "setup", "error", "join");
  showOn("duel-not-now", "join");
  showOn("duel-end", "waiting", "connected", "error");
  showOn("duel-share", "connected");
  showOn("duel-foot", "setup");
  $("duel-invite").firstElementChild.textContent = invite;
  const error = problem(v);
  $("duel-error").hidden = !error || screen === "join"; // the link's room is a new start
  if ($("duel-error").textContent !== error) $("duel-error").textContent = error; // an alert: said again only when new
  $("duel-go").textContent = { error: "Try again", join: "Join duel" }[screen] ?? "Connect";
  $("duel-leave").textContent = screen === "error" ? "Back to face to face" : "Leave duel";
  $("duel-leave").classList.toggle("danger", screen !== "error");
  const [waiting, room] = $("duel-wait").children;
  waiting.lastElementChild.textContent = waitingFor(v);
  room.textContent = v.room;
  const [dot, who, liveRoom] = $("duel-live").children;
  $("duel-live").classList.toggle("dropped", v.phase === "dropped");
  $("duel-live").classList.toggle("left", v.phase === "left");
  dot.className = `dot ${dotFor(v.phase)}`;
  who.textContent = STATUS[v.phase]?.(otherName(v)) ?? ""; // shown only while live, dropped or left
  liveRoom.textContent = v.room;
  showWins($("wins-list"), $("wins-when"), v.board, v.me, v.playedAt);
  $("wins-undo").hidden = !v.last || v.phase !== "live"; // the other player has to be there to agree
  for (const chip of $("chips").children) chip.ariaPressed = String(Number(chip.textContent) === v.minutes);
}
