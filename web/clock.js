// The duel clock: a chess clock shared between the two phones, which meet in a room (room.js). Its saved state lives
// under its own key, apart from the game's, so the normal game is never affected. The pure functions at the top are
// what tests/test_clock.py runs in Node; everything below them touches the browser and the room.

import { cleanRoom, onVisible, open, roomName } from "./room.js";
import { NO_WINS, board, counted, latestWins, playerName, uncounted } from "./wins.js";

const STORAGE_KEY = "word-clock";
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

// Both clocks stopped where they are at `now`, then `running` started: a new view
const stopAt = (view, now, by, running) => ({
  mine: left(view, "mine", now),
  theirs: left(view, "theirs", now),
  running,
  at: now,
  seq: view.seq + 1,
  by,
});

// After a guess is noted at `now`: my clock stops where it is, the other player's starts
export const pressed = (view, now, by) => stopAt(view, now, by, "theirs");

// The other player left: both clocks stop where they are. It counts as a new view, so a phone that rejoins with a fresh
// clock at seq 0 adopts it, and play goes on from the same times.
export const paused = (view, now, by) => stopAt(view, now, by, null);

// Both clocks back to full and stopped
export const reset = (view, minutes, now, by) => ({ ...fresh(minutes), at: now, seq: view.seq + 1, by });

// A phone's id in the views it makes: the host's starts higher, so at the same seq its view wins on both phones.
// That's how a joining phone's fresh clock gives way to the host's, minutes and all.
export const phoneId = (host, id) => (host ? "1" : "0") + id;

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

// Whether either clock has started since the last reset: until then the first guess is free. Clocks stopped
// by a player leaving after the game got going are not full, so they count as started.
export const started = (view, minutes) =>
  Boolean(view.running) || view.mine < minutes * MINUTE || view.theirs < minutes * MINUTE;

// Whether a game is going on the clocks: started, and neither has run out. Ticking or stopped by a player leaving,
// those are times worth asking about before they're reset; once one has run out, the game on them is over.
export const inPlay = (view, minutes, now) =>
  started(view, minutes) && left(view, "mine", now) > 0 && left(view, "theirs", now) > 0;

// --- The mode in the browser ---
// Saved: { id: this phone's, kept for good, name, room: as typed, madeUp: the room made up for this phone,
//         host: whether it joined its made-up room, joined: whether the duel is on (the room is rejoined on load),
//         opponent: { id, host } of the phone playing this one, null until it speaks, minutes, clock: a view,
//         wins: { room: { players: { name: games won }, at } }, the games each player has won in each room,
//         last: { winner: name, side: "mine" | "theirs" }, this room's last game if it was won, until it's undone }

const EMPTY = { id: "", name: "", room: "", madeUp: "", host: false, joined: false, opponent: null, minutes: 10, clock: fresh(10), wins: {}, last: null };

let state = { ...EMPTY };
let onChange = () => {};
let onGame = () => {}; // app.js's handler for the other phone's "game" messages
// The room while joined, with its channels: "clock" for the views; "game" for a claimed win, its answer, a New game and
// undoing a win (app.js words them); and "bye", sent when leaving so the other phone can tell it from a dropout, apart
// from "clock" so its seq order stays as it is
let room = null;
const CHANNELS = ["clock", "game", "bye"];
let peer = ""; // the opponent's peer id, "" while it isn't here
let names = {}; // peer id → name, for every phone in the room
let gone = null; // the name of the player who dropped out ("" if they sent none), until someone connects
let departed = null; // the name of the player who tapped Leave ("" if they sent none), until someone connects
let joinedAt = 0; // when the other phone last arrived, for the dock's "joined" note
let error = ""; // what went wrong, for duel.js to word: "room" (none typed), "https" or "join", "" when all is well

// An older save lacks the newer fields, so the defaults fill them in
function load() {
  try {
    const saved = { ...EMPTY, ...JSON.parse(localStorage.getItem(STORAGE_KEY)) };
    return { ...saved, clock: { ...EMPTY.clock, ...saved.clock } };
  } catch {
    return { ...EMPTY };
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export function init(change, heard) {
  onChange = change;
  onGame = heard;
  state = load();
  if (!state.id) state.id = Math.random().toString(36).slice(2); // breaks ties between the two phones' views
  // Back from a locked phone or another app: a message may have been missed, or the connection dropped. A quick trip
  // away, like the share sheet while sending the link, keeps a waiting phone's room as it is, so a friend joining
  // just then isn't missed.
  onVisible(({ away }) => {
    if (!state.joined) return;
    if (peer) share();
    else if (gone !== null || away) rejoin();
    onChange();
  });
}

// On load, when modes.js finds the duel was the mode on: the saved room is rejoined
export function resume() {
  if (state.joined) join();
}

// The setup screen opened: the room is made up the first time and kept from then on, and an old complaint goes
export function setUp() {
  if (!state.madeUp) state.madeUp = roomName();
  if (!state.joined) error = "";
  save();
}

// Typed into the sheet before connecting; kept so they're there next time
export function edit(field, value) {
  if (state.joined || !["name", "room"].includes(field)) return;
  state[field] = value;
  save();
  if (error) tell(""); // typing answers "Type a room name"
}

// `joining`: from a shared link, which is always someone else's room to join
export function connect(name, typed, joining = false) {
  name = name.trim().slice(0, 12);
  typed = cleanRoom(typed);
  if (!typed) return tell("room");
  leaveRoom(); // Try again comes here too, from whatever is left of the failed join
  error = "";
  gone = departed = null;
  // The phone that set up its own made-up room hosts it; any other room is someone else's to join
  const host = !joining && typed === state.madeUp;
  // A fresh clock, so an old one never carries into a new room; at seq 0 it gives way to any game in progress
  const clock = { ...fresh(state.minutes), at: Date.now(), by: phoneId(host, state.id) };
  state = { ...state, name, room: typed, host, joined: true, opponent: null, clock, last: null };
  save();
  join();
  onChange();
}

export function disconnect() {
  leaveRoom();
  error = "";
  gone = departed = null;
  state.joined = false;
  save();
  onChange();
}

// A guess was noted. app.js renders the page after it.
export function press() {
  if (state.joined) commit(pressed(state.clock, Date.now(), myId()));
}

// New game was confirmed: both clocks back to full, so a word changed mid-game never keeps its time, and the other
// phone is told. app.js renders the page after it.
export function newGame() {
  if (!state.joined) return;
  commit(reset(state.clock, state.minutes, Date.now(), myId()));
  send({ type: "new" });
}

// A win was confirmed: both clocks stop where they are
export function stop() {
  if (state.joined) commit(paused(state.clock, Date.now(), myId()));
  onChange();
}

// A game ended, won by "mine" or "theirs", or drawn (null): one more win for the winner in this room, by name, the
// time it was played, and the other phone is told
export function ended(winner) {
  const players = { mine: myName(), theirs: theirName() };
  const tally = counted(roomWins(), Object.values(players), players[winner], Date.now());
  state.wins = { ...state.wins, [state.room]: tally };
  state.last = winner ? { winner: players[winner], side: winner } : null;
  save();
  share();
  onChange();
}

// This phone's player agreed to undo the last win: one fewer for the winner, sent to the other phone with the clock.
// Only the agreeing phone changes the tally, so the win is never taken off twice.
export function undo() {
  if (!state.last) return;
  state.wins = { ...state.wins, [state.room]: uncounted(roomWins(), state.last.winner, Date.now()) };
  state.last = null;
  save();
  share();
  onChange();
}

// The other player agreed to undo the last win: their phone's tally, without it, comes with their clock
export function forget() {
  state.last = null;
  save();
  onChange();
}

// A "game" message to the other phone, if it's here
export function send(data) {
  if (room && peer) room.send("game", data, peer);
}

// duel.js asks first while a game is going on the clocks
export function setMinutes(value) {
  const minutes = clampMinutes(value, state.minutes);
  if (minutes === state.minutes) return onChange(); // puts a rejected value back
  const now = Date.now();
  if (state.joined) commit(reset(state.clock, minutes, now, myId()));
  else save();
  onChange();
}

// Everything the page shows for the mode, as data: duel.js puts it into words
export function view() {
  const now = Date.now();
  const { name, room: typed, madeUp, joined, minutes, clock } = state;
  const side = (which) => ({ left: left(clock, which, now), running: ticking(clock, now) && clock.running === which });
  return {
    active: joined,
    phase: phase(),
    name,
    room: typed,
    madeUp,
    host: isHost(),
    minutes,
    peerName: peer ? (names[peer] ?? "") : (departed ?? gone ?? ""), // as their phone sent it; "" before it has
    joinedAt,
    started: started(clock, minutes),
    myTurn: !joined || clock.running !== "theirs", // a guess can be noted unless the other player's clock is running
    inPlay: inPlay(clock, minutes, now),
    error,
    mine: side("mine"),
    theirs: side("theirs"),
    me: myName(),
    board: board(roomWins()),
    playedAt: roomWins().at,
    last: state.last,
  };
}

// off, waiting for the other phone, live with it, dropped (it went away and may come back), left (its player tapped
// Leave), or error (couldn't join)
function phase() {
  if (!state.joined) return "off";
  if (error) return "error";
  if (peer) return "live";
  if (departed !== null) return "left";
  return gone === null ? "waiting" : "dropped";
}

// Whether this phone is player one: the one that hosts its made-up room, or when both or neither do (both typed
// "family"), the one with the higher id, which is also the one whose fresh clock wins the tie at seq 0
function isHost() {
  const other = state.opponent;
  return other && other.host === state.host ? state.id > other.id : state.host;
}

const myId = () => phoneId(state.host, state.id);

// The names the room's wins are kept under: as typed, or player one and two
const myName = () => state.name || playerName(isHost() ? 0 : 1);
const theirName = () => (peer ? names[peer] : (departed ?? gone)) || playerName(isHost() ? 1 : 0);

// This room's wins; an older save's two-sided tally starts again
const roomWins = () => (state.wins[state.room]?.players ? state.wins[state.room] : NO_WINS);

function tell(problem) {
  error = problem;
  onChange();
}

// A press or reset made on this phone: kept, and sent to the other one
function commit(clock) {
  state.clock = clock;
  save();
  share();
}

// This phone's view, to the opponent or to a phone that has just joined. The name goes as typed: when it's empty the
// other phone works out the default itself, once it knows which of the two is player one.
function share(to = peer) {
  if (!room || !to) return;
  const data = { ...message(state.clock, Date.now(), state.name, state.minutes), id: state.id, host: state.host };
  data.wins = roomWins();
  room.send("clock", data, to);
}

// A phone that joins is told this one's view, and becomes the opponent once it answers. The opponent is whichever
// phone spoke first, by its own saved id: a third phone that opened the same link is ignored, and the opponent's phone
// coming back with a new peer id (after being locked, while its old connection can take a while to be seen as gone)
// takes its place at once.
const received = {
  clock(data, peerId) {
    if (typeof data?.seq !== "number") return;
    const from = { id: String(data.id ?? peerId), host: Boolean(data.host) };
    if (state.opponent && state.opponent.id !== from.id) return;
    const arrived = peerId !== peer;
    if (!peer) joinedAt = Date.now();
    peer = peerId;
    gone = departed = null;
    names[peerId] = String(data.name ?? "").slice(0, 12);
    state.opponent = from;
    const theirs = mirrored(data, Date.now());
    if (newer(theirs, state.clock)) {
      state.clock = theirs;
      state.minutes = clampMinutes(data.minutes, state.minutes);
    }
    const wins = roomWins();
    state.wins = { ...state.wins, [state.room]: latestWins(wins, data.wins) };
    save();
    // A phone that has just arrived needs this one's id; one that missed a press, a reset or a win needs it again
    // (it adopts it, so this can't go back and forth)
    if (arrived || newer(state.clock, theirs) || wins.at > (Number(data.wins?.at) || 0)) share();
    onChange();
  },
  game(data, peerId) {
    if (peerId === peer && typeof data?.type === "string") onGame(data);
  },
  // The other player tapped Leave: both clocks stop until they come back. Their phone's leave, which follows, finds
  // no peer to drop, so it doesn't turn "left" into "dropped out".
  bye(data, peerId) {
    if (peerId !== peer) return;
    state.clock = paused(state.clock, Date.now(), myId());
    save();
    departed = names[peerId] ?? "";
    peer = "";
    onChange();
  },
};

function join() {
  if (room) return;
  if (!isSecureContext) return tell("https"); // the library's crypto isn't there on plain http
  room = open(state.room, CHANNELS, {
    ready: () => {
      if (error) tell(""); // a rejoin that worked clears an earlier failure
    },
    failed: () => {
      room = null;
      tell("join");
    },
    peerJoin: (id) => share(id),
    peerLeave: (id) => {
      const name = names[id] ?? "";
      delete names[id];
      if (id !== peer) return;
      peer = "";
      gone = name;
      onChange();
    },
    message: (channel, data, peerId) => received[channel](data, peerId),
  });
}

// The page's state lets go of the room at once, and the other phone is told this one has left
function leaveRoom() {
  room?.close(peer ? { channel: "bye", data: true, to: peer } : undefined);
  room = null;
  peer = "";
  names = {};
}

function rejoin() {
  leaveRoom();
  join();
}
