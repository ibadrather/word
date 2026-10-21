// The group game: 2 to 4 phones in one room (room.js) guess a word the computer deals, taking turns, with a clock each.
// Its saved state lives under its own key, apart from the solo game's and the duel's. The pure functions at the top are
// what tests/test_group.py runs in Node; everything below them touches the browser and the room.

import { isWord, randomWords, score } from "./helpers.js";
import { cleanRoom, onVisible, open, roomName } from "./room.js";
import { board as ranked } from "./wins.js";

const STORAGE_KEY = "word-group";
const MINUTE = 60_000;
export const SEATS = 4; // phones in a game, at most
const AWAY = 30_000; // how long the player whose turn it is has to come back before their turn is skipped
const KEPT = 200; // games kept in each room's results
const NAME = 12; // characters in a name, as in the duel

// --- The table: one game, shared by its seats. { game: its id, deal: one more than the room's last deal, dealer: the
//     id of the phone that dealt it, word, minutes: each player's, seats: [{ id, name }] in turn order (2 to 4),
//     moves: [{ seat: id, kind: "guess" | "skip" | "leave" | "time", word (a guess's), used: ms that turn took,
//     by: the id of the phone that wrote it }], one a turn, quit: { id: moves made when they tapped Leave off their
//     turn }, at: this phone's wall-clock ms when the running turn started }. `at` never crosses phones: a message
//     carries how long the turn has run instead. Everything else (whose turn it is, the times left, who is out, the
//     winners) is worked out from the table by play(), so phones can't disagree about it. ---

// What each kind of move is worth when two phones wrote different moves for the same turn: a guess beats everything,
// as its player was there to make it; a time-out is what any phone works out once the clock has run down
const RANK = { time: 0, skip: 1, leave: 2, guess: 3 };
const order = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
// A move with its fields in one order, so two phones' copies of it compare equal
const shape = ({ seat, kind, word, used, by }) => (kind === "guess" ? { seat, kind, word, used, by } : { seat, kind, used, by });
const better = (a, b) => (RANK[a.kind] - RANK[b.kind] || order(b.by, a.by) || order(b.word ?? "", a.word ?? "") || b.used - a.used) > 0;

// The fold's running state, before any move
const begin = (table) => ({
  table,
  moves: [], // the moves that fit, as they fit
  out: {}, // id → "time" | "left"
  spent: {}, // id → ms their clock has run
  turn: 0, // the seat whose turn it is
  last: false, // someone got the word, so the turns go on only to the end of this round
  over: false,
  winners: [], // ids, in the order they got it
  guessed: new Map(), // word → the id that guessed it
  notes: [], // [{ seat: id, word, count, at: ms into the game, won }], oldest first
  time: 0, // ms into the game
});

const budget = (f) => f.table.minutes * MINUTE;
const timeLeft = (f, id) => budget(f) - (f.spent[id] ?? 0);
const clockOn = (f) => f.moves.length > 0; // the first guess is free, so the clocks start once it's made

// The turn passes to the next seat that isn't out. In the last round it only goes on towards the end of the seats;
// with one seat still in, every turn is theirs. With nobody left to play, the game is over.
function advance(f) {
  const { seats } = f.table;
  for (let step = 1; step <= seats.length; step++) {
    const seat = f.turn + step;
    if (f.last && seat >= seats.length) break;
    if (!f.out[seats[seat % seats.length].id]) return void (f.turn = seat % seats.length);
  }
  f.over = true;
}

// Players who tapped Leave off their turn are out from that point on
function quits(f, upTo) {
  const leaving = Object.entries(f.table.quit)
    .filter(([id, at]) => at <= upTo && !f.out[id])
    .sort(([a, n], [b, m]) => n - m || order(a, b));
  for (const [id] of leaving) {
    if (f.over) return;
    f.out[id] = "left";
    if (f.table.seats[f.turn].id === id) advance(f);
  }
}

// Whether a word can be guessed: it's in the dictionary and nobody has guessed it yet. The word itself always can:
// whoever gets it first, the players after them in the round may get it too, for a draw (they never see it).
const free = (f, word) => isWord(word) && (!f.guessed.has(word) || word === f.table.word);

// A move as it fits the turn, or null if it doesn't: it must be the seat's whose turn it is, and a guess must be one
// that can be made, before its player's time ran out. A skip or a leave that came after the time ran out is a
// time-out. A time-out fits only once the clock has run down.
function fit(f, move) {
  if (f.over || !Object.hasOwn(RANK, move.kind) || move.seat !== f.table.seats[f.turn].id) return null;
  const left = timeLeft(f, move.seat);
  const late = clockOn(f) && move.used >= left;
  if (move.kind === "guess") return free(f, move.word) && !late ? shape(move) : null;
  if (move.kind === "time") return late ? shape({ ...move, used: left }) : null;
  return shape(late ? { ...move, kind: "time", used: left } : move);
}

function apply(f, move) {
  const id = move.seat;
  if (clockOn(f)) f.spent[id] = (f.spent[id] ?? 0) + move.used;
  f.time += move.used;
  f.moves.push(move);
  if (move.kind === "guess") {
    // Only the word itself wins: an anagram (pots for stop) scores 4 but isn't it
    const won = move.word === f.table.word;
    if (!f.guessed.has(move.word)) f.guessed.set(move.word, id);
    f.notes.push({ seat: id, word: move.word, count: score(move.word, f.table.word), at: f.time, won });
    if (won) {
      f.winners.push(id);
      f.last = true;
    }
  } else if (move.kind !== "skip") {
    f.out[id] = move.kind === "time" ? "time" : "left";
  }
  advance(f);
}

// The fold over a table's moves, then over the clock as it has run since the last one: a player whose time runs out
// is out at that very moment and the next player's turn starts then, with no message from anyone.
function fold(table, now) {
  const f = begin(table);
  for (const move of table.moves) {
    quits(f, f.moves.length);
    const fitted = fit(f, move);
    if (!fitted) break; // nothing after a move that doesn't fit can fit either
    apply(f, fitted);
  }
  quits(f, Number.POSITIVE_INFINITY);
  f.due = []; // the time-outs worked out from the clock alone, written into the table with the next move
  let running = Math.max(0, now - table.at);
  while (clockOn(f) && !f.over) {
    const id = table.seats[f.turn].id;
    const left = timeLeft(f, id);
    if (running < left) break;
    running -= left;
    const out = shape({ seat: id, kind: "time", used: left, by: "" });
    f.due.push(out);
    apply(f, out);
  }
  f.running = f.over ? 0 : running; // how long the turn being played has run
  return f;
}

// Everything worked out from a table at `now` on this phone: whose turn it is (null once it's over), each seat's time
// left, who is out and why, the winners, the guesses and the game's time so far
export function play(table, now = table.at) {
  const f = fold(table, now);
  const { seats } = table;
  const turn = f.over ? null : seats[f.turn].id;
  const left = Object.fromEntries(
    seats.map(({ id }) => [id, Math.max(0, timeLeft(f, id) - (id === turn && clockOn(f) ? f.running : 0))]),
  );
  // In the last round, the seats still to play their last guess, this turn's first
  const lastGuesses = f.last && !f.over ? seats.slice(f.turn).filter(({ id }) => !f.out[id]).map(({ id }) => id) : [];
  return {
    turn,
    over: f.over,
    winners: f.winners,
    out: f.out,
    left,
    lastGuesses,
    notes: f.notes,
    guessed: f.guessed,
    moves: f.moves, // every turn so far, the time-outs worked out from the clock too
    due: f.due,
    free: !clockOn(f), // no clock runs yet: the first guess is free
    running: f.running,
    time: f.time + f.running,
  };
}

// A new move for the turn being played: it takes the time the turn has run, after any time-outs that came before it.
// The running turn then starts now.
function moved(table, p, move, now) {
  return { ...table, moves: [...p.moves, shape({ ...move, used: p.running })], at: now };
}

// Why `id` can't guess `word` now ({ why, who? }: "over", "seat", "out", "turn" with whose it is, "word", or "again"
// with who guessed it first), or { table } with the guess noted and scored
export function guessed(table, id, word, now) {
  const p = play(table, now);
  if (!table.seats.some((seat) => seat.id === id)) return { why: "seat" };
  if (p.over) return { why: "over" };
  if (p.out[id]) return { why: "out", reason: p.out[id] };
  if (p.turn !== id) return { why: "turn", who: p.turn };
  if (!isWord(word)) return { why: "word" };
  if (p.guessed.has(word) && word !== table.word) return { why: "again", who: p.guessed.get(word) };
  return { table: moved(table, p, { seat: id, kind: "guess", word, by: id }, now) };
}

// The player whose turn it is was away too long: their turn is skipped (by the phone `by`), with the time it ran
export function skipped(table, id, by, now) {
  const p = play(table, now);
  return p.turn === id ? moved(table, p, { seat: id, kind: "skip", by }, now) : table;
}

// `id` tapped Leave: out of the game, which counts as losing it. On their own turn it's that turn's move; off it, the
// point they left at, so the turns after it pass them by.
export function left(table, id, now) {
  const p = play(table, now);
  if (p.over || p.out[id] || !table.seats.some((seat) => seat.id === id)) return table;
  if (p.turn === id) return moved(table, p, { seat: id, kind: "leave", by: id }, now);
  return { ...table, moves: p.moves, quit: { ...table.quit, [id]: p.moves.length }, at: now - p.running };
}

// Whether a new word can be dealt: there's no game yet, or it's over
export const dealing = (table, now) => !table || play(table, now).over;

// A new game for the phones in the lobby ([{ id, name }]): the dealer first, then the others by phone id, so every
// phone that sees the same lobby gets the same order, 4 at most. The word is a common one, never a blocked one.
export function dealt(lobby, dealer, minutes, deal, now, random = Math.random) {
  const first = lobby.find((player) => player.id === dealer);
  if (!first) return null;
  const others = lobby.filter((player) => player.id !== dealer).sort((a, b) => order(a.id, b.id));
  const seats = [first, ...others].slice(0, SEATS).map(({ id, name }) => ({ id, name }));
  if (seats.length < 2) return null;
  const [word] = randomWords(1, random);
  return { game: `${dealer}:${deal}`, deal, dealer, word, minutes, seats, moves: [], quit: {}, at: now };
}

// Whether table a was dealt after table b: the later deal wins, and the dealer's id settles a tie
const later = (a, b) => a.deal > b.deal || (a.deal === b.deal && a.dealer > b.dealer);

// Whether two tables are at the same point of the same game
export const same = (a, b) =>
  Boolean(a && b) &&
  a.game === b.game &&
  JSON.stringify(a.moves) === JSON.stringify(b.moves) &&
  JSON.stringify(Object.entries(a.quit).sort()) === JSON.stringify(Object.entries(b.quit).sort());

// Two phones' tables as one. A later deal wins outright. For the same game, the moves are merged turn by turn: at each
// turn the better of the two moves that still fits is kept (a guess beats a skip), so a guess one phone missed while
// another skipped that turn isn't lost, and a guess never reshuffles the turns after it. Leaving is kept from either,
// at the earliest point. The running turn keeps this phone's start if the moves are as it had them, or else takes
// the other phone's.
export function merged(ours, theirs) {
  if (!ours || !theirs) return ours ?? theirs;
  if (ours.game !== theirs.game) return later(theirs, ours) ? theirs : ours;
  const quit = { ...theirs.quit };
  for (const [id, at] of Object.entries(ours.quit)) quit[id] = Math.min(at, quit[id] ?? at);
  const f = begin({ ...ours, quit });
  for (let i = 0; i < Math.max(ours.moves.length, theirs.moves.length); i++) {
    quits(f, i);
    const [a, b] = [ours.moves[i], theirs.moves[i]].map((move) => move && fit(f, move));
    if (!a && !b) break;
    apply(f, a && (!b || !better(b, a)) ? a : b);
  }
  const moves = f.moves;
  const at = JSON.stringify(moves) === JSON.stringify(ours.moves) ? ours.at : theirs.at;
  return { ...ours, quit, moves, at };
}

// What a phone sends: its table, with how long the running turn has run instead of when it started
export function message(table, now) {
  const { at, ...rest } = table;
  return { ...rest, elapsed: now - at };
}

const MINUTES = (value) => Math.min(60, Math.max(1, Math.round(Number(value)) || 10));

// Another phone's message as a table on this phone, started `elapsed` ms before `now` by this phone's clock, or null
// if it isn't one. Everything in it is checked, as it comes from another phone.
export function received(data, now) {
  if (!data || typeof data !== "object" || !Array.isArray(data.seats) || !Array.isArray(data.moves)) return null;
  const seats = data.seats.slice(0, SEATS).map((seat) => ({ id: String(seat?.id ?? ""), name: String(seat?.name ?? "").slice(0, NAME) }));
  const ids = new Set(seats.map((seat) => seat.id));
  const word = String(data.word ?? "");
  if (seats.length < 2 || ids.size < seats.length || ids.has("") || !isWord(word)) return null;
  // A move of a kind this phone doesn't know ends the moves there: nothing after it can be trusted to fit
  const known = data.moves.findIndex((move) => !Object.hasOwn(RANK, move?.kind));
  const moves = data.moves.slice(0, known < 0 ? undefined : known).map((move) =>
    shape({
      seat: String(move.seat ?? ""),
      kind: move.kind,
      word: String(move.word ?? "").slice(0, 4),
      used: Math.max(0, Number(move.used) || 0),
      by: String(move.by ?? ""),
    }),
  );
  const quit = Object.fromEntries(
    Object.entries(data.quit ?? {})
      .filter(([id]) => ids.has(id))
      .map(([id, at]) => [id, Math.max(0, Math.floor(Number(at)) || 0)]),
  );
  const deal = Math.max(0, Math.floor(Number(data.deal)) || 0);
  const dealer = String(data.dealer ?? "");
  const elapsed = Math.max(0, Number(data.elapsed) || 0);
  return { game: `${dealer}:${deal}`, deal, dealer, word, minutes: MINUTES(data.minutes), seats, moves, quit, at: now - elapsed };
}

// --- Results and the wins board. A room's results: { [game]: { at: when it ended, in UTC ms, players: [names],
//     winners: [names], moves: how many turns it took } }. Every phone records a game when its own fold says it's
//     over, so a dropout never loses one. ---

// A game's result once it's over, or null while it's on
export function result(table, now) {
  const p = play(table, now);
  if (!p.over) return null;
  const name = (id) => table.seats.find((seat) => seat.id === id).name;
  return { at: now, players: table.seats.map((seat) => seat.name), winners: p.winners.map(name), moves: p.moves.length };
}

const names = (list) => (Array.isArray(list) ? list.slice(0, SEATS).map((name) => String(name).slice(0, NAME)) : []);

// Two phones' results as one: every game either has, and for a game both have, the one with more moves, as a late
// guess can change how it ended. The newest 200 games are kept.
export function mergedResults(ours, theirs) {
  const all = { ...ours };
  for (const [game, entry] of Object.entries(theirs ?? {})) {
    const at = Number(entry?.at) || 0;
    const moves = Math.max(0, Number(entry?.moves) || 0);
    if (all[game] && all[game].moves >= moves) continue;
    all[game] = { at, players: names(entry?.players), winners: names(entry?.winners), moves };
  }
  return Object.fromEntries(Object.entries(all).sort(([, a], [, b]) => b.at - a.at).slice(0, KEPT));
}

// The room's wins from its results: a win for each game with exactly one winner (several are a draw), everyone who
// played listed, most wins first; and when the last game was played
export function wins(results) {
  const players = {};
  let at = 0;
  for (const entry of Object.values(results)) {
    for (const name of entry.players) players[name] ??= 0;
    if (entry.winners.length === 1) players[entry.winners[0]] = (players[entry.winners[0]] ?? 0) + 1;
    at = Math.max(at, entry.at);
  }
  return { board: ranked({ players }), at };
}

// --- The mode in the browser ---
// Saved: { id: this phone's, kept for good, name: required, room: as typed, madeUp: the room made up for this phone,
//         joined: whether the group game is on (the room is rejoined on load), minutes: for a game this phone deals,
//         table: the game this phone is seated in, or the last one, book: { colours, helper } the key colours and
//         helper this phone uses in the group game, apart from the solo game's, results: { room: results } }

const EMPTY = { id: "", name: "", room: "", madeUp: "", joined: false, minutes: 5, table: null, book: { colours: {}, helper: "" }, results: {} };
const CHANNELS = ["hello", "table", "results", "bye"];

let state = { ...EMPTY };
let onChange = () => {};
// The room while joined, with its channels: "hello" says who a phone is and whether a game is on (it builds the
// lobby); "table" goes only to seated phones, and each phone passes on a table it adopts, so phones that can't reach
// each other still agree; "results" are the room's games; "bye" is sent on Leave
let room = null;
let peers = {}; // peer id → { id, name, since: when it joined the room, by this phone's clock, game: { deal, dealer, seats } while one is on }
let joinedAt = 0; // when this phone joined the room
let awaySince = {}; // seat id → when this phone last saw it go, for the 30 s a player has to come back
let heardDeal = 0; // the room's latest deal, so a new one is always later
let error = ""; // for lobby.js to word: "room", "name", "https", "join", "full", "busy", "" when all is well

function load() {
  try {
    const saved = { ...EMPTY, ...JSON.parse(localStorage.getItem(STORAGE_KEY)) };
    return { ...saved, book: { ...EMPTY.book, ...saved.book } };
  } catch {
    return { ...EMPTY };
  }
}

export function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export function init(change) {
  onChange = change;
  state = load();
  if (!state.id) state.id = Math.random().toString(36).slice(2);
  // Back from a locked phone or another app: after a minute away the connection may have gone, so the room is joined
  // again; after a quick trip, the others are told where this phone is
  onVisible(({ away }) => {
    if (!state.joined || error) return;
    if (away) rejoin();
    else {
      hello();
      shareTable();
    }
    onChange();
  });
  // A phone that couldn't join while offline tries again once it's online
  addEventListener("online", () => {
    if (state.joined && error === "join") join();
  });
}

// On load, when modes.js finds the group game was the mode on: the saved room is rejoined
export function resume() {
  if (state.joined) join();
}

// The setup screen opened: the room is made up the first time and kept from then on, and an old complaint goes
export function setUp() {
  if (!state.madeUp) state.madeUp = roomName();
  if (!state.joined) error = "";
  save();
}

// Typed into the sheet. The name can change in the lobby too (when it's taken), never during a game.
export function edit(field, value) {
  if (field === "room" && !state.joined) state.room = value;
  else if (field === "name" && !(state.joined && gameOn())) state.name = value.trim().slice(0, NAME);
  else return;
  save();
  if (state.joined) hello();
  if (error === field) error = ""; // typing answers "Type a room name" or "Type your name"
  onChange();
}

export function connect(name, typed) {
  name = name.trim().slice(0, NAME);
  typed = cleanRoom(typed);
  if (!typed) return tell("room");
  if (!name) return tell("name");
  leaveRoom(); // Try again comes here too, from whatever is left of the failed join
  error = "";
  // A game from another room is dropped; in the same room, a seated phone takes its seat again
  const table = typed === state.room ? state.table : null;
  state = { ...state, name, room: typed, joined: true, table };
  save();
  join();
  onChange();
}

// Leave, or another mode taking over: mid-game, that's losing it, and the other phones are told
export function disconnect() {
  if (gameOn()) {
    state.table = left(state.table, state.id, Date.now());
    shareTable();
  }
  leaveRoom();
  error = "";
  state.joined = false;
  save();
  onChange();
}

// A new word for everyone here: "" if it was dealt, or why not ("on", "name", "taken", "alone")
export function deal() {
  const now = Date.now();
  if (!dealing(state.table, now)) return "on";
  if (!state.name) return "name";
  if (taken()) return "taken";
  const players = lobby().filter((player) => !player.taken);
  if (players.length < 2) return "alone";
  const deal = Math.max(state.table?.deal ?? 0, heardDeal) + 1;
  adopt(dealt(players.slice(0, SEATS), state.id, state.minutes, deal, now));
  shareTable();
  onChange();
  return "";
}

// This phone's guess: {} if it was noted, or why not, as guessed() says
export function guess(word) {
  if (!state.table) return { why: "seat" };
  const { table, ...why } = guessed(state.table, state.id, word, Date.now());
  if (!table) return why;
  commit(table);
  return {};
}

export function setMinutes(minutes) {
  state.minutes = MINUTES(minutes);
  save();
  onChange();
}

// The key colours and helper this phone uses in the group game, for app.js to show and change (it saves them)
export const book = () => state.book;

// Every second, while the group game is the mode on: a game that's over is recorded, and the player whose turn it is
// is skipped if they've been away for 30 s. The next seat still in that this phone can see does that; when 3 or more
// are still in, only if this phone can see one of the others, or it may be the one offline.
export function watch() {
  const { table } = state;
  if (!room || !table || !seated(state.id)) return;
  const now = Date.now();
  const p = play(table, now);
  if (p.over) return record(now);
  const id = p.turn;
  if (id === state.id || here(id)) return;
  awaySince[id] ??= now;
  if (now - awaySince[id] < AWAY || skipper(p) !== state.id) return;
  const still = table.seats.filter((seat) => !p.out[seat.id]);
  if (still.length >= 3 && !still.some((seat) => seat.id !== id && seat.id !== state.id && here(seat.id))) return;
  commit(skipped(table, id, state.id, now));
}

// Everything the page shows for the mode, as data: lobby.js puts it into words
export function view() {
  const now = Date.now();
  const { table } = state;
  const p = table && play(table, now);
  const away = {}; // seat id → ms left of the 30 s, for each seat that isn't here
  for (const seat of table?.seats ?? []) {
    if (seat.id !== state.id && !here(seat.id)) away[seat.id] = Math.max(0, AWAY - (now - (awaySince[seat.id] ?? now)));
  }
  const { board, at } = wins(state.results[state.room] ?? {});
  return {
    active: state.joined,
    phase: !state.joined ? "off" : error ? "error" : gameOn() ? "game" : "lobby",
    error,
    id: state.id,
    name: state.name,
    room: state.room,
    madeUp: state.madeUp,
    minutes: state.minutes,
    lobby: lobby(),
    taken: taken(),
    table,
    play: p,
    seated: seated(state.id),
    away,
    board,
    playedAt: at,
  };
}

// The phones here, this one included, in the order they joined the room: [{ id, name, me, taken }]. A name that an
// earlier phone has is taken, and that phone can't play until it picks another.
function lobby() {
  const phones = new Map([[state.id, { id: state.id, name: state.name, since: joinedAt, me: true }]]);
  for (const peer of Object.values(peers)) if (!phones.has(peer.id)) phones.set(peer.id, { ...peer, me: false });
  const list = [...phones.values()].sort((a, b) => a.since - b.since || order(a.id, b.id));
  return list.map((phone, i) => ({
    id: phone.id,
    name: phone.name,
    me: phone.me,
    taken: list.slice(0, i).some((other) => other.name.toLowerCase() === phone.name.toLowerCase()),
  }));
}

const taken = () => lobby().find((phone) => phone.me).taken;
const seated = (id) => Boolean(state.table?.seats.some((seat) => seat.id === id));
const here = (id) => Object.values(peers).some((peer) => peer.id === id);
// Whether this phone is seated in a game that's on, in it or out of it
const gameOn = () => seated(state.id) && !play(state.table, Date.now()).over;

// The next seat after the player whose turn it is that is still in and here (this phone always is)
function skipper(p) {
  const { seats } = state.table;
  const from = seats.findIndex((seat) => seat.id === p.turn);
  for (let step = 1; step < seats.length; step++) {
    const { id } = seats[(from + step) % seats.length];
    if (!p.out[id] && (id === state.id || here(id))) return id;
  }
  return "";
}

function tell(problem) {
  error = problem;
  onChange();
}

// A table this phone has moved to: a new game clears the key colours. When a game starts or ends, every phone here is
// told, so one that isn't in it steps back, or knows it can deal again.
function adopt(table) {
  const was = gameOf(state.table);
  if (table.game !== state.table?.game) {
    state.book.colours = {};
    awaySince = {};
  }
  state.table = table;
  save();
  if (gameOf(table) !== was) hello();
}

// The game a table is, and whether it's over
const gameOf = (table) => (table ? `${table.game} ${play(table, Date.now()).over}` : "");

// A move made on this phone: kept, and sent to the other seats
function commit(table) {
  adopt(table);
  shareTable();
  onChange();
}

function record(now) {
  const results = state.results[state.room] ?? {};
  const entry = result(state.table, now);
  if (!entry || (results[state.table.game]?.moves ?? -1) >= entry.moves) return;
  state.results = { ...state.results, [state.room]: mergedResults(results, { [state.table.game]: entry }) };
  save();
  send("results", state.results[state.room]);
  onChange();
}

// To one phone, or to every phone here
function send(channel, data, to) {
  if (room) room.send(channel, data, to);
}

// Who this phone is, how long it has been here, and the game it's in while one is on
function hello(to) {
  const { table } = state;
  const on = table && !play(table, Date.now()).over;
  const game = on ? { deal: table.deal, dealer: table.dealer, seats: table.seats.map((seat) => seat.id) } : null;
  send("hello", { id: state.id, name: state.name, joined: Date.now() - joinedAt, deal: table?.deal ?? 0, game }, to);
}

// The table to every seated phone here, but `except` (the one it came from)
function shareTable(except) {
  if (!state.table) return;
  for (const [peerId, peer] of Object.entries(peers)) {
    if (peerId !== except && seated(peer.id)) send("table", message(state.table, Date.now()), peerId);
  }
}

// Why this phone can't play here, or "": a game is on that it isn't in (one dealt after any it's in), or the room is
// full, with 4 phones that joined before it
function unwelcome() {
  const mine = gameOn() ? state.table : null;
  const games = Object.values(peers).map((peer) => peer.game);
  if (games.some((game) => game && !game.seats.includes(state.id) && (!mine || later(game, mine)))) return "busy";
  if (!mine && lobby().findIndex((phone) => phone.me) >= SEATS) return "full";
  return "";
}

// A phone that can't play here says why and leaves the room by itself
function stepBack(problem) {
  leaveRoom(true);
  tell(problem);
}

const heard = {
  hello(data, peerId) {
    const id = String(data?.id ?? "");
    if (!id || id === state.id) return;
    const seats = Array.isArray(data.game?.seats) ? data.game.seats.slice(0, SEATS).map(String) : null;
    const game = seats && { deal: Number(data.game.deal) || 0, dealer: String(data.game.dealer ?? ""), seats };
    const since = peers[peerId]?.since ?? Date.now() - Math.max(0, Number(data.joined) || 0);
    peers[peerId] = { id, name: String(data.name ?? "").slice(0, NAME), since, game };
    delete awaySince[id];
    heardDeal = Math.max(heardDeal, Number(data.deal) || 0);
    const problem = unwelcome();
    if (problem) return stepBack(problem);
    if (seated(id)) send("table", message(state.table, Date.now()), peerId);
    onChange();
  },
  table(data, peerId) {
    const theirs = received(data, Date.now());
    if (!theirs || !theirs.seats.some((seat) => seat.id === state.id)) return;
    const ours = state.table;
    const table = merged(ours, theirs);
    if (!same(table, ours)) {
      adopt(table);
      shareTable(peerId);
    }
    if (!same(table, theirs)) send("table", message(table, Date.now()), peerId);
    onChange();
  },
  results(data, peerId) {
    if (!data || typeof data !== "object") return;
    const ours = state.results[state.room] ?? {};
    const all = mergedResults(ours, data);
    if (JSON.stringify(all) !== JSON.stringify(ours)) {
      state.results = { ...state.results, [state.room]: all };
      save();
      onChange();
    }
    if (Object.keys(all).some((game) => data[game]?.moves !== all[game].moves)) send("results", all, peerId);
  },
  // The phone tapped Leave: the table it sent just before says what that meant for the game
  bye(data, peerId) {
    gone(peerId);
  },
};

function gone(peerId) {
  const peer = peers[peerId];
  delete peers[peerId];
  if (peer && !here(peer.id)) awaySince[peer.id] = Date.now();
  onChange();
}

function join() {
  if (room) return;
  if (!isSecureContext) return tell("https"); // the library's crypto isn't there on plain http
  if (!navigator.onLine) return tell("join"); // a link opened offline: the page comes from the cache, the room can't
  joinedAt = Date.now();
  awaySince = {};
  room = open(`group/${state.room}`, CHANNELS, {
    ready: () => {
      if (error) tell(""); // a rejoin that worked clears an earlier failure
    },
    failed: () => {
      room = null;
      tell("join");
    },
    peerJoin: (peerId) => {
      hello(peerId);
      send("results", state.results[state.room] ?? {}, peerId);
    },
    peerLeave: gone,
    message: (channel, data, peerId) => heard[channel](data, peerId),
  });
}

// The page's state lets go of the room at once, and the others are told this phone has left
function leaveRoom(quietly = false) {
  room?.close(quietly ? undefined : { channel: "bye", data: true });
  room = null;
  peers = {};
}

function rejoin() {
  leaveRoom(true);
  join();
}
