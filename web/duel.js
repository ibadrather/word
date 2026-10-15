// The duel clock's screens: the dock of two clocks pinned to the bottom of the page, like a real chess clock.
// Everything it shows comes from clock.js's view(); app.js calls render() on every change and tick() every second.

import * as mode from "./clock.js";

const $ = (id) => document.getElementById(id);
const JOINED_NOTE = 4_000; // how long "… joined" stays on the dock's edge, in ms
const SIDES = ["mine", "theirs"];

let labelled = ""; // what the clocks' labels were last written for, so they change with the turn, not every tick

export function init() {
  // The middle button opens the clock's settings, in the menu for now
  $("dock-menu").addEventListener("click", () => openMenuAt("clock-settings"));
}

function openMenuAt(id) {
  $("menu").showModal();
  $(id).scrollIntoView();
}

export function render() {
  const v = mode.view();
  document.body.classList.toggle("duel", v.active); // makes room under the page for the dock
  $("dock").hidden = !v.active;
  const idle = v.phase === "waiting" || v.phase === "error"; // nobody there to play against
  for (const which of SIDES) $(which).classList.toggle("idle", idle);
  $("theirs").firstElementChild.textContent = otherName(v);
  $("dock-menu").lastElementChild.className = `dot ${v.phase === "live" ? "live" : "wait"}`;
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

const otherName = (v) => v.peerName || "Player two";

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
  if (v.phase === "waiting") return { text: "Waiting for player two…", dot: "wait" };
  if (v.phase === "error") return { text: v.error, warn: true };
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
