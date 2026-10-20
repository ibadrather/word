// How you play: face to face, or online with the duel clock. This is the one place that knows which of them is on. It
// ticks the menu's choice, shows that mode's dock, rejoins only that mode's room on load, opens shared links, and is
// what app.js goes through to note a guess, start a new game, render and tick. Each online mode keeps its own logic
// (clock.js) and screens (duel.js); the screens fill in their own dock, and only this file shows or hides it.

import { ask } from "./ask.js";
import * as clock from "./clock.js";
import * as duel from "./duel.js";
import { roomFromLink } from "./room.js";

const STORAGE_KEY = "word-mode";
const $ = (id) => document.getElementById(id);

// The modes that go online, by their value in the menu: their logic and screens, their dock, the query parameter their
// links carry the room in, and what the page calls them
const ONLINE = {
  duel: { logic: clock, screens: duel, dock: "dock", param: "room", called: "the duel" },
};

let saved = "face"; // the mode that was on when last rendered: on load, only its room is rejoined

// The mode that's on: an online one whose room is joined, the saved one if two are, or else face to face
function current() {
  const on = Object.keys(ONLINE).filter((name) => ONLINE[name].logic.view().active);
  return on.includes(saved) ? saved : (on[0] ?? "face");
}

// A save from before this file came from the online mode that was joined
function load() {
  try {
    const mode = localStorage.getItem(STORAGE_KEY);
    if (mode === "face" || Object.hasOwn(ONLINE, mode)) return mode;
  } catch {}
  return Object.keys(ONLINE).find((name) => ONLINE[name].logic.view().active) ?? "face";
}

function save(mode) {
  saved = mode;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {}
}

// After the modes' own init(), which load their saves: only the saved mode rejoins its room. Any other still joined
// (an old save, or another tab) is left, so two rooms are never rejoined behind each other's backs.
export function init() {
  save(load());
  for (const { screens } of Object.values(ONLINE)) screens.init();
  for (const input of document.getElementsByName("play")) input.addEventListener("change", choose);
  for (const [name, { logic }] of Object.entries(ONLINE)) {
    if (name === saved) logic.resume();
    else if (logic.view().active) logic.disconnect();
  }
}

// "How you play": an online mode opens its sheet in the menu's place; Face to face leaves the one that's on without
// asking
function choose(event) {
  const online = ONLINE[event.target.value];
  if (online) {
    $("menu").close();
    online.screens.open();
  } else {
    ONLINE[current()]?.logic.disconnect();
  }
  showChoice(current()); // an online mode stays unchecked until it's really on
}

// A shared link (?room=… for the duel) opens the mode it's for, once: the address loses the room, so a refresh or
// bookmark doesn't ask again. If another online mode is on, it asks before leaving it.
export async function openLink() {
  const [name, room] =
    Object.entries(ONLINE)
      .map(([name, { param }]) => [name, roomFromLink(location.search, param)])
      .find(([, room]) => room) ?? [];
  if (!room) return;
  history.replaceState(null, "", location.pathname + location.hash);
  const on = current();
  if (on !== "face" && on !== name) {
    if (!(await ask(`Leave ${ONLINE[on].called} and join ${ONLINE[name].called}?`, { yes: "Leave and join" }))) return;
    ONLINE[on].logic.disconnect();
  }
  ONLINE[name].screens.invited(room);
}

// What app.js asks of the mode that's on

// Whether a guess can be noted now: "" if it can, or else why not, in the page's words
export const turn = () => ONLINE[current()]?.screens.turn() ?? "";

// A guess was noted. app.js renders the page after it.
export function note(word, count) {
  ONLINE[current()]?.screens.note(word, count);
}

// New game, asked in the mode's own words: whether app.js should clear its game
export function newGame() {
  return ONLINE[current()]?.screens.newGame() ?? ask("Clear your word, guesses and key colours?", { yes: "New game" });
}

// On every change. Every mode's screens are drawn, as a sheet can be open before its mode is on, but only the mode
// that's on shows its dock.
export function render() {
  const on = current();
  if (on !== saved) save(on);
  for (const { screens } of Object.values(ONLINE)) screens.render();
  for (const [name, { dock }] of Object.entries(ONLINE)) $(dock).hidden = name !== on;
  document.body.classList.toggle("docked", on !== "face"); // makes room under the page for the dock
  showChoice(on);
  showTimesUp(on);
}

// Every second
export function tick() {
  const on = current();
  ONLINE[on]?.screens.tick();
  showTimesUp(on);
}

function showChoice(on) {
  for (const input of document.getElementsByName("play")) input.checked = input.value === on;
}

// When the other player's time runs out instead, the dock alone shows it
function showTimesUp(on) {
  $("times-up").hidden = !ONLINE[on]?.screens.timesUp();
}
