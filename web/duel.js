// The duel clock's screens: the dock of two clocks pinned to the bottom of the page, like a real chess clock; the sheet
// that drops from the top to set the duel up and shows it while it's on; and the menu's "How you play" choice.
// Everything they show comes from clock.js's view(); app.js calls render() on every change and tick() every second.

import * as mode from "./clock.js";

const $ = (id) => document.getElementById(id);
const JOINED_NOTE = 4_000; // how long "… joined" stays on the dock's edge, in ms
const SIDES = ["mine", "theirs"];
const MINUTES = [3, 5, 10, 15, 30]; // the chips; minutes off this list (an older save, or sent) light none and are kept
const SCREENS = { off: "setup", waiting: "waiting", live: "connected", dropped: "connected", error: "error" };

let labelled = ""; // what the clocks' labels were last written for, so they change with the turn, not every tick
let shown = ""; // the sheet's screen at the last render, so it folds away only from Waiting

export function init() {
  $("dock-menu").addEventListener("click", open);
  for (const input of document.getElementsByName("play")) input.addEventListener("change", choose);
  $("duel-close").addEventListener("click", () => $("duel").close());
  $("duel").addEventListener("click", (event) => {
    if (event.target === $("duel")) $("duel").close(); // a tap on the dimmed page below the sheet
  });
  $("duel-room").addEventListener("input", typeRoom);
  $("duel-name").addEventListener("input", (event) => mode.edit("name", event.target.value));
  $("duel-go").addEventListener("click", connect);
  $("duel-leave").addEventListener("click", leave);
  for (const minutes of MINUTES) {
    const chip = Object.assign(document.createElement("button"), { type: "button", textContent: minutes });
    chip.addEventListener("click", () => mode.setMinutes(minutes)); // asks first while a clock ticks
    $("chips").append(chip);
  }
}

// "How you play": Duel clock opens the sheet in the menu's place; Face to face leaves a duel without asking
function choose(event) {
  if (event.target.value === "duel") {
    $("menu").close();
    open();
  } else {
    mode.disconnect();
  }
  showChoice(mode.view()); // Duel clock stays unchecked until a duel is really on
}

function open() {
  if (!mode.view().active) mode.setUp();
  const v = mode.view();
  // The fields are written only here, so a render while typing never moves the cursor
  $("duel-room").value = v.room || v.madeUp;
  $("duel-name").value = v.name;
  showJoining();
  showSheet(v);
  if (!$("duel").open) $("duel").showModal();
}

// Lowercase as it's typed, with the cursor kept where it was
function typeRoom(event) {
  const input = event.target;
  const lower = input.value.toLowerCase();
  if (lower !== input.value) {
    const at = input.selectionStart;
    input.value = lower;
    input.setSelectionRange(at, at);
  }
  mode.edit("room", input.value);
  showJoining();
}

// A room typed over the made-up one is someone else's to join: the name's default and the last hint say so
function showJoining() {
  const joining = $("duel-room").value.trim() !== mode.view().madeUp;
  $("duel-name").placeholder = joining ? "Player two" : "Player one";
  $("duel-foot").textContent = joining
    ? "Joining? Your minutes give way to the other phone's."
    : "Both phones need internet to find each other.";
}

function connect() {
  mode.connect($("duel-name").value, $("duel-room").value);
  if ($("duel-go").hidden) $("duel").firstElementChild.focus(); // the button is gone, so focus stays in the sheet
}

function leave() {
  $("duel").close();
  mode.disconnect();
}

export function render() {
  const v = mode.view();
  document.body.classList.toggle("duel", v.active); // makes room under the page for the dock
  $("dock").hidden = !v.active;
  const idle = v.phase === "waiting" || v.phase === "error"; // nobody there to play against
  for (const which of SIDES) $(which).classList.toggle("idle", idle);
  $("theirs").firstElementChild.textContent = otherName(v);
  $("dock-menu").lastElementChild.className = `dot ${v.phase === "live" ? "live" : "wait"}`;
  showChoice(v);
  showSheet(v);
  tick();
}

// The times, which side runs or has run out, and the note on the dock's edge
export function tick() {
  const v = mode.view();
  $("times-up").hidden = !v.active || v.mine.left > 0; // when theirs runs out, the dock alone shows it
  if (!v.active) return;
  for (const which of SIDES) {
    $(which).lastElementChild.textContent = time(v[which].left);
    $(which).classList.toggle("running", v[which].running);
    $(which).classList.toggle("over", v[which].left === 0);
  }
  label(v);
  showNote(note(v, Date.now()));
}

// The host's other player is player two, and the other way round, until their phone sends a name
const otherName = (v) => v.peerName || (v.host ? "Player two" : "Player one");
const waitingFor = (v) => `Waiting for ${v.host ? "player two" : "player one"}…`;

// What went wrong, in the sheet's words
const problem = (v) =>
  ({
    room: "Type a room name",
    https: "The duel clock needs the https site.",
    join: `Couldn't join ${v.room}. Check this phone is online and try again.`,
  })[v.error] ?? "";

// Rounded up: 0:00 only once the time is really gone
const time = (ms) => mode.formatTime(ms + 999);

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
function note(v, now) {
  if (v.phase === "waiting") return { text: waitingFor(v), dot: "wait" };
  if (v.phase === "error") return { text: v.error === "join" ? `Couldn't join ${v.room}` : problem(v), warn: true };
  if (v.phase === "dropped") return { text: `${otherName(v)} dropped out · reconnecting…`, dot: "wait", warn: true };
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

function showChoice(v) {
  $("play-duel").checked = v.active;
  $("play-face").checked = !v.active;
}

// The sheet shows one of four screens. It folds away by itself when the other phone arrives while it shows Waiting,
// but stays put when opened mid-game to look at the minutes.
function showSheet(v) {
  const screen = SCREENS[v.phase];
  if (shown === "waiting" && screen === "connected") $("duel").close();
  shown = screen;
  const showOn = (id, ...screens) => ($(id).hidden = !screens.includes(screen));
  showOn("duel-intro", "setup");
  showOn("duel-wait", "waiting");
  showOn("duel-live", "connected");
  showOn("duel-room-field", "setup", "error");
  showOn("duel-room-hint", "setup");
  showOn("duel-name-field", "setup");
  showOn("duel-go", "setup", "error");
  showOn("duel-leave", "waiting", "connected", "error");
  showOn("duel-foot", "setup");
  const error = problem(v);
  $("duel-error").hidden = !error;
  if ($("duel-error").textContent !== error) $("duel-error").textContent = error; // an alert: said again only when new
  $("duel-go").textContent = screen === "error" ? "Try again" : "Connect";
  $("duel-leave").textContent = screen === "error" ? "Back to face to face" : "Leave duel";
  $("duel-leave").classList.toggle("danger", screen !== "error");
  const [waiting, room] = $("duel-wait").children;
  waiting.lastElementChild.textContent = waitingFor(v);
  room.textContent = v.room;
  const [dot, who, liveRoom] = $("duel-live").children;
  const dropped = v.phase === "dropped";
  $("duel-live").classList.toggle("dropped", dropped);
  dot.className = `dot ${dropped ? "wait" : "live"}`;
  who.textContent = dropped ? `${otherName(v)} dropped out · reconnecting…` : `${otherName(v)} is connected`;
  liveRoom.textContent = v.room;
  for (const chip of $("chips").children) chip.ariaPressed = String(Number(chip.textContent) === v.minutes);
}
