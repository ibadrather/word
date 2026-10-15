// The two-player clock: a chess clock shared between the two phones. Trystero (trystero.js) finds the other phone
// through public Nostr relays, then the phones talk directly over WebRTC. Its saved state lives under its own key,
// apart from the game's, so the normal game is never affected. The pure functions at the top are what
// tests/test_clock.py runs in Node; everything below them touches the browser and the room.

const STORAGE_KEY = "word-clock";
const APP_ID = "ibadrather-word";
const MINUTE = 60_000;

// --- A view of the clocks: { mine, theirs: ms left on each side at `at`, running: "mine" | "theirs" | null,
//     at: this phone's wall-clock ms when the running clock last (re)started, seq: one more on every press or reset,
//     by: an id of the phone that made it, to break ties }. Views are ordered by seq, never by time, and only
//     elapsed times cross between the phones, never `at`: two phones' clocks are never quite in step. ---

export const fresh = (minutes) => ({ mine: minutes * MINUTE, theirs: minutes * MINUTE, running: null, at: 0, seq: 0, by: "" });

// ms left on a side at `now`
export const left = (view, side, now) => Math.max(0, view[side] - (view.running === side ? now - view.at : 0));

// Whether a clock is ticking; one that has run out counts as stopped
export const ticking = (view, now) => Boolean(view.running) && left(view, view.running, now) > 0;

// After a guess is noted at `now`: my clock stops where it is, the other player's starts
export const pressed = (view, now, by) => ({
  mine: left(view, "mine", now),
  theirs: left(view, "theirs", now),
  running: "theirs",
  at: now,
  seq: view.seq + 1,
  by,
});

// Both clocks back to full and stopped
export const reset = (view, minutes, now, by) => ({ ...fresh(minutes), at: now, seq: view.seq + 1, by });

// Whether view a was made after view b: the later press or reset wins, and the phone id settles a tie
export const newer = (a, b) => a.seq > b.seq || (a.seq === b.seq && a.by > b.by);

// What a phone sends: its view from its own side, with how long the running clock has run instead of when it started
export const message = (view, now, name, minutes) => ({
  name,
  minutes,
  mine: view.mine,
  theirs: view.theirs,
  running: view.running,
  elapsed: view.running ? now - view.at : 0,
  seq: view.seq,
  by: view.by,
});

// The other phone's message as a view from this side, started `elapsed` ms before `now` on this phone's clock
const OTHER_SIDE = { mine: "theirs", theirs: "mine" };
export const mirrored = (data, now) => ({
  mine: data.theirs,
  theirs: data.mine,
  running: OTHER_SIDE[data.running] ?? null,
  at: now - data.elapsed,
  seq: data.seq,
  by: data.by,
});

// Minutes each, 1 to 60; anything else (empty, 0, letters) keeps the old value
export const clampMinutes = (value, old) => (value >= 1 ? Math.min(60, Math.round(value)) : old);

// --- The mode in the browser ---
// Saved: { name, room: as typed, joined: whether the mode is on (the room is rejoined on load), minutes, clock: a view }

let state = { name: "", room: "", joined: false, minutes: 10, clock: fresh(10) };
let onChange = () => {};
let room = null; // the Trystero room while joined
let action = null; // the room's "clock" messages
let peer = ""; // the other player's peer id, "" while alone
let names = {}; // peer id → name, for every phone in the room
let gone = ""; // who left, shown until someone connects
let note = ""; // a problem to show: validation before joining, a failed join after
const me = Math.random().toString(36).slice(2); // breaks ties between the two phones' views

function load() {
  const empty = { name: "", room: "", joined: false, minutes: 10, clock: fresh(10) };
  try {
    const saved = { ...empty, ...JSON.parse(localStorage.getItem(STORAGE_KEY)) };
    return { ...saved, clock: { ...empty.clock, ...saved.clock } };
  } catch {
    return empty;
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export function init(change) {
  onChange = change;
  state = load();
  if (state.joined) join();
  // Back from a locked phone or another app: a message may have been missed, or the connection dropped
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !state.joined) return;
    if (peer) share();
    else rejoin();
    onChange();
  });
}

// Typed into the menu before connecting; kept so they're there next time
export function edit(field, value) {
  if (state.joined || !["name", "room"].includes(field)) return;
  state[field] = value;
  save();
}

export function connect(name, roomName) {
  name = name.trim().slice(0, 12);
  roomName = roomName.trim().toLowerCase().slice(0, 20);
  if (!name || !roomName) return tell("Type your name and a room name");
  if (!isSecureContext) return tell("The clock needs the https site"); // the library's crypto isn't there on http
  note = gone = "";
  // A fresh clock, so an old one never carries into a new room; at seq 0 it gives way to any game in progress
  state = { ...state, name, room: roomName, joined: true, clock: { ...fresh(state.minutes), at: Date.now(), by: me } };
  save();
  join();
  onChange();
}

export function disconnect() {
  leaveRoom();
  note = gone = "";
  state.joined = false;
  save();
  onChange();
}

// A guess was noted
export function press() {
  if (!state.joined) return;
  state.clock = pressed(state.clock, Date.now(), me);
  save();
  share();
  onChange();
}

// New game was confirmed: both clocks back to full, unless one is ticking and the player wants to keep it
export function newGame() {
  if (!state.joined) return;
  if (ticking(state.clock, Date.now()) && !confirm("Also restart both clocks?")) return;
  restart();
}

export function setMinutes(value) {
  const minutes = clampMinutes(value, state.minutes);
  if (minutes === state.minutes) return onChange(); // puts a rejected value back
  if (state.joined && ticking(state.clock, Date.now()) && !confirm(`Restart both clocks with ${minutes} minutes?`)) {
    return onChange();
  }
  state.minutes = minutes;
  if (state.joined) return restart();
  save();
  onChange();
}

// Everything the page shows for the mode
export function view() {
  const now = Date.now();
  const { name, room: roomName, joined, minutes, clock } = state;
  const side = (which, who) => ({ name: who, left: left(clock, which, now), running: ticking(clock, now) && clock.running === which });
  return {
    active: joined,
    name,
    room: roomName,
    minutes,
    live: Boolean(peer),
    status: status(),
    note: joined ? status() : note,
    mine: side("mine", name || "You"),
    theirs: side("theirs", names[peer] || "Other player"),
  };
}

function status() {
  if (!state.joined) return "";
  if (note) return note;
  if (peer) return `${names[peer] || "Other player"} connected · ${state.room}`;
  if (gone) return `${gone} left ${state.room} · waiting…`;
  return `Waiting for a player in ${state.room}…`;
}

function tell(text) {
  note = text;
  onChange();
}

function restart() {
  state.clock = reset(state.clock, state.minutes, Date.now(), me);
  save();
  share();
  onChange();
}

function share() {
  if (!action || !peer) return;
  action.send(message(state.clock, Date.now(), state.name, state.minutes), { target: peer }).catch(() => {});
}

// The library is loaded only here, so a problem in it can never reach the normal game
async function join() {
  if (room) return;
  if (!isSecureContext) return tell("The clock needs the https site");
  try {
    const { joinRoom } = await import("./trystero.js");
    if (room || !state.joined) return; // left, or joined again, while the library loaded
    room = joinRoom({ appId: APP_ID }, state.room);
    action = room.makeAction("clock");
  } catch {
    return tell(`Couldn't join ${state.room}`);
  }
  // The other player is whoever joined or spoke last: a phone that comes back after being locked gets a new id
  // while its old connection can take a while to be seen as gone, so neither a join nor a message waits for a leave.
  // A room we have left can still report leaves for a moment; those are not about the room we are in now.
  const joined = room;
  joined.onPeerJoin = (id) => {
    if (joined !== room) return;
    peer = id;
    gone = "";
    share();
    onChange();
  };
  joined.onPeerLeave = (id) => {
    if (joined !== room) return;
    const name = names[id] || "The other player";
    delete names[id];
    if (id !== peer) return;
    peer = Object.keys(joined.getPeers()).find((other) => other !== id) ?? "";
    if (!peer) gone = name;
    onChange();
  };
  action.onMessage = (data, { peerId }) => {
    if (joined !== room || typeof data?.seq !== "number") return;
    peer = peerId;
    gone = "";
    names[peerId] = String(data.name ?? "").slice(0, 12);
    const theirs = mirrored(data, Date.now());
    if (newer(theirs, state.clock)) {
      state.clock = theirs;
      state.minutes = clampMinutes(data.minutes, state.minutes);
      save();
    } else if (newer(state.clock, theirs)) {
      share(); // they missed a press or reset: send it again (they adopt it, so this can't go back and forth)
    }
    onChange();
  };
}

function leaveRoom() {
  room?.leave().catch(() => {});
  room = action = null;
  peer = "";
  names = {};
}

function rejoin() {
  leaveRoom();
  join();
}
