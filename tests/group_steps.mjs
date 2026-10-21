// Plays the group game's pure logic through games and prints what each step showed: node group_steps.mjs
// Times are ms on each phone's own clock; Ben's phone runs 7 seconds ahead of Asha's throughout, and Cleo's 7 behind.
import { BLOCKED, COMMON } from "../web/common.js";
import { BLOCKED as BLOCKED5, COMMON as COMMON5 } from "../web/common5.js";
import {
  dealing,
  dealt,
  guessed,
  left,
  merged,
  mergedResults,
  message,
  play,
  received,
  result,
  same,
  skipped,
  wins,
} from "../web/group.js";

const out = {};
const MINUTE = 60_000;
const ben = (ashaTime) => ashaTime + 7_000; // the same moment on Ben's phone
const cleo = (ashaTime) => ashaTime - 7_000; // and on Cleo's

// A seeded random, so a deal can be played again
function seeded(seed) {
  return () => {
    seed = (seed * 16_807) % 2_147_483_647;
    return (seed - 1) / 2_147_483_646;
  };
}

const ASHA = { id: "a", name: "Asha" };
const BEN = { id: "b", name: "Ben" };
const CLEO = { id: "c", name: "Cleo" };
const DEV = { id: "d", name: "Dev" };
const EVE = { id: "e", name: "Eve" };

// A table with a chosen word, as Asha deals it at `at` on her phone
const table = (seats, word, minutes = 1, at = 0) => ({ ...dealt(seats, seats[0].id, minutes, 1, at, seeded(1)), word });

// Notes a guess, or says why not (the refusal, so a step can show it)
function guess(t, id, word, now) {
  const { table: next, ...why } = guessed(t, id, word, now);
  return next ?? why;
}
const shown = (p) => ({ turn: p.turn, over: p.over, winners: p.winners, out: p.out });

// --- Dealing: the dealer first, then the others by phone id, 4 at most; the word is common and never blocked ---

const lobby = [EVE, CLEO, BEN, DEV, ASHA];
const deal = dealt(lobby, "c", 5, 3, 1_000, seeded(42));
const words = Array.from({ length: 500 }, (_, i) => dealt([ASHA, BEN], "a", 5, 1, 0, seeded(i + 1)).word);
out.dealing = {
  seats: deal.seats.map((seat) => seat.id),
  sameOrder: dealt([...lobby].reverse(), "c", 5, 3, 1_000, seeded(42)).seats.map((seat) => seat.id),
  game: deal.game,
  minutes: deal.minutes,
  common: words.every((word) => COMMON.includes(word)),
  blocked: words.some((word) => BLOCKED.has(word)),
  alone: dealt([ASHA], "a", 5, 1, 0),
  noDealer: dealt([ASHA, BEN], "c", 5, 1, 0),
  noGame: dealing(null, 0),
  midGame: dealing(deal, 2_000),
};

// --- Guesses: refused off turn, not a word, or already on the table, and scored without asking ---

let t = table([ASHA, BEN, CLEO], "stop", 1, 0);
const offTurn = guess(t, "b", "bear", 1_000);
const notWord = guess(t, "a", "bxqz", 1_000);
t = guess(t, "a", "bear", 20_000); // 20 s in, but the first guess is free
const free = play(t, 20_000);
const yoursAgain = guess(t, "b", "bear", 25_000);
t = guess(t, "b", "pots", 30_000); // an anagram scores 4 but isn't the word
const anagram = play(t, 30_000);
const theirsAgain = guess(t, "c", "pots", 31_000);
const stranger = guess(t, "e", "lion", 31_000);
out.guesses = {
  offTurn,
  notWord,
  free: { turn: free.turn, left: free.left, notes: free.notes },
  yoursAgain,
  anagram: { turn: anagram.turn, winners: anagram.winners, note: anagram.notes.at(-1), left: anagram.left.b },
  theirsAgain,
  stranger,
};

// --- Time: a time-out needs no message, and the next clock starts at that moment ---

t = table([ASHA, BEN, CLEO], "stop", 1, 0);
t = guess(t, "a", "bear", 1_000);
const before = play(t, 60_999);
const after = play(t, 61_000 + 5_000); // Ben's minute ran out at 61 s, so Cleo's clock has run 5 s
// A guess that ran past its player's time is dropped, whichever phone it came from
const late = { ...t, moves: [...t.moves, { seat: "b", kind: "guess", word: "lion", used: 61_000, by: "b" }] };
// The guess after a time-out: the time-out goes in with it, and the turn after Cleo's is Asha's
const afterOut = guess(t, "c", "lion", 61_000 + 5_000);
out.time = {
  before: { turn: before.turn, left: before.left },
  after: { ...shown(after), left: after.left, due: after.due },
  late: play(late, 2_000).notes.length,
  afterOut: { moves: afterOut.moves.map((move) => [move.seat, move.kind, move.used]), turn: play(afterOut, 66_000).turn },
};

// The last one with time keeps going: Ben runs out, so every turn is Asha's until she gets it or runs out too
t = table([ASHA, BEN], "stop", 1, 0);
t = guess(t, "a", "bear", 1_000);
t = guess(t, "a", "lion", 61_000 + 2_000); // Ben ran out at 61 s
const alone = play(t, 70_000);
const nobody = play(t, 63_000 + 60_000);
t = guess(t, "a", "stop", 64_000);
out.lastOne = {
  turn: alone.turn,
  left: alone.left,
  nobody: { ...shown(nobody), time: nobody.time },
  wins: shown(play(t, 64_000)),
};

// --- Finishing the round: after the first winner, every seat after them still in gets one last guess ---

const four = () => guess(table([ASHA, BEN, CLEO, DEV], "stop", 1, 0), "a", "bear", 1_000);
const round = (moves) => {
  let r = four();
  for (const [id, word, at] of moves) r = word ? guess(r, id, word, at) : left(r, id, at);
  return r;
};
const firstSeat = round([
  ["b", "lion", 2_000],
  ["c", "cart", 3_000],
  ["d", "dime", 4_000],
  ["a", "stop", 5_000],
]);
const firstLast = round([
  ["b", "lion", 2_000],
  ["c", "cart", 3_000],
  ["d", "dime", 4_000],
  ["a", "stop", 5_000],
  ["b", "pots", 6_000],
]);
const middle = round([
  ["b", "lion", 2_000],
  ["c", "stop", 3_000],
]);
const draw = round([
  ["b", "lion", 2_000],
  ["c", "stop", 3_000],
  ["d", "stop", 4_000], // Dev never saw Cleo's guess, so the word can be guessed again
]);
const lastSeat = round([
  ["b", "lion", 2_000],
  ["c", "cart", 3_000],
  ["d", "stop", 4_000],
]);
// Cleo gets it, and Dev's minute runs out before his last guess: he's passed over and the game is over
const passedOver = round([
  ["b", "lion", 2_000],
  ["c", "stop", 3_000],
]);
out.round = {
  firstSeat: { ...shown(play(firstSeat, 5_000)), lastGuesses: play(firstSeat, 5_000).lastGuesses },
  firstLast: { ...shown(play(firstLast, 6_000)), lastGuesses: play(firstLast, 6_000).lastGuesses },
  middle: { ...shown(play(middle, 3_000)), lastGuesses: play(middle, 3_000).lastGuesses },
  draw: shown(play(draw, 4_000)),
  lastSeat: shown(play(lastSeat, 4_000)),
  passedOver: shown(play(passedOver, 3_000 + MINUTE)),
};

// --- Leaving: on your own turn, off it, and as the last seat's last guess after a winner ---

const ownTurn = round([["b", "", 2_000]]);
const offIt = round([["c", "", 2_000]]); // Cleo leaves on Ben's turn
const offItLater = guess(guess(offIt, "b", "lion", 3_000), "d", "dime", 4_000);
const lastLeave = round([
  ["b", "lion", 2_000],
  ["c", "stop", 3_000],
  ["d", "", 4_000],
]);
out.leaving = {
  ownTurn: { ...shown(play(ownTurn, 2_000)), move: ownTurn.moves.at(-1).kind },
  offIt: { ...shown(play(offIt, 2_000)), quit: offIt.quit },
  offItLater: shown(play(offItLater, 4_000)),
  lastLeave: shown(play(lastLeave, 4_000)),
  twice: same(left(ownTurn, "b", 3_000), ownTurn),
};

// --- Dropouts: a turn skipped after 30 s away, an away player skipped at once, and one who comes back ---

t = table([ASHA, BEN, CLEO], "stop", 1, 0);
t = guess(t, "a", "bear", 1_000);
const skip = skipped(t, "b", "c", 31_000); // Ben dropped as his turn began: Cleo skips him 30 s later
t = guess(skip, "c", "cart", 40_000);
t = guess(t, "a", "lion", 41_000);
const atOnce = skipped(t, "b", "c", 41_000); // still away when his turn comes round: skipped straight away
t = guess(atOnce, "c", "dime", 42_000);
t = guess(t, "a", "mile", 43_000);
const back = guess(t, "b", "pots", 50_000); // Ben is back for his next turn
out.dropouts = {
  skip: { move: skip.moves.at(-1), turn: play(skip, 31_000).turn, left: play(skip, 31_000).left.b },
  notTheirTurn: same(skipped(skip, "b", "c", 32_000), skip),
  atOnce: { used: atOnce.moves.at(-1).used, left: play(atOnce, 41_000).left.b },
  back: { turn: play(back, 50_000).turn, left: play(back, 50_000).left.b, notes: play(back, 50_000).notes.length },
};

// --- Merging: phones that missed each other's moves end up with the same table ---

// Asha's phone deals; Ben's gets it 1 s later and Asha's clock is running there as here
const start = guess(table([ASHA, BEN, CLEO], "stop", 1, 0), "a", "bear", 1_000);
const onBen = received(message(start, 2_000), ben(3_000));
out.received = { same: same(onBen, start), ashaShows: play(start, 31_000).left.b, benShows: play(onBen, ben(31_000)).left.b };

// The partial mesh: Cleo lost Ben and skipped him at 31 s, while Ben guessed at 20 s and Asha saw it
const benGuessed = guess(onBen, "b", "lion", ben(21_000));
const onAsha = merged(start, received(message(benGuessed, ben(21_000)), 21_500));
const onCleo = received(message(start, 2_000), cleo(2_500));
const cleoSkipped = guess(skipped(onCleo, "b", "c", cleo(31_000)), "c", "cart", cleo(33_000));
const ashaFirst = merged(onAsha, received(message(cleoSkipped, cleo(33_000)), 34_000));
const cleoFirst = merged(cleoSkipped, received(message(onAsha, 34_000), cleo(34_500)));
out.merging = {
  guessBeatsSkip: ashaFirst.moves.map((move) => [move.seat, move.kind, move.word]),
  bothWays: same(ashaFirst, cleoFirst),
  // Cleo's guess still fits after Ben's, so it stays: the turns after a late guess aren't reshuffled
  cleoKept: play(ashaFirst, 34_000).notes.map((note) => note.word),
};
// Two phones skip the same turn: the merge keeps one of them, the same one on both
const skipA = skipped(t, "b", "a", 31_000);
const skipC = skipped(t, "b", "c", 31_500);
out.merging.twoSkips = {
  same: same(merged(skipA, skipC), merged(skipC, skipA)),
  moves: merged(skipA, skipC).moves.length - t.moves.length,
};
// A later deal beats an old game, from either side
const newDeal = dealt([ASHA, BEN, CLEO], "b", 5, 2, 50_000, seeded(7));
out.merging.laterDeal = [merged(start, newDeal).game, merged(newDeal, start).game];
// Relaying: Asha and Cleo can't reach each other, only Ben. Asha guesses, Ben adopts it and passes it on to Cleo.
let a = start;
let b = onBen;
let c = onCleo;
b = guess(b, "b", "lion", ben(10_000));
a = merged(a, received(message(b, ben(10_000)), 10_200));
c = merged(c, received(message(b, ben(10_000)), cleo(10_300))); // Ben passes it on
c = guess(c, "c", "cart", cleo(20_000));
b = merged(b, received(message(c, cleo(20_000)), ben(20_200)));
a = merged(a, received(message(b, ben(20_200)), 20_400));
out.merging.relay = {
  same: same(a, b) && same(b, c),
  turn: [play(a, 25_000).turn, play(b, ben(25_000)).turn, play(c, cleo(25_000)).turn],
  // Asha's clock as each phone shows it 5 s into her turn, within the 0.2-0.4 s the messages took
  left: [play(a, 25_000).left.a, play(b, ben(25_000)).left.a, play(c, cleo(25_000)).left.a],
};
// What arrives is checked: a made-up table, a 5th seat, a strange move
out.received.bad = [null, {}, { seats: [ASHA], moves: [] }, { seats: [ASHA, ASHA], moves: [], word: "stop" }].map((data) =>
  received(data, 0),
);
const odd = received(
  { ...message(start, 2_000), seats: [ASHA, BEN, CLEO, DEV, EVE], moves: [...start.moves, { seat: "b", kind: "cheat" }, start.moves[0]] },
  2_000,
);
out.received.odd = { seats: odd.seats.length, moves: odd.moves.length };

// --- Results and the wins board: a union of every phone's games, the longer entry for the same game ---

const won = result(round([["b", "lion", 2_000], ["c", "stop", 3_000], ["d", "dime", 4_000]]), 9_000);
const drawn = result(draw, 8_000);
const lost = result(guess(guess(table([ASHA, BEN], "stop", 1, 0), "a", "bear", 1_000), "b", "lion", 2_000), 300_000);
out.results = {
  won,
  drawn,
  lost,
  onGoing: result(four(), 2_000),
};
const early = { g1: { at: 5_000, players: ["Asha", "Ben"], winners: ["Asha"], moves: 5 } };
const longer = { g1: { at: 6_000, players: ["Asha", "Ben"], winners: ["Asha", "Ben"], moves: 6 }, g2: { ...won } };
const all = mergedResults(early, longer);
out.results.merged = { games: Object.keys(all).sort(), g1: all.g1.winners, back: mergedResults(all, early).g1.moves };
out.results.board = wins({ won: { ...won }, drawn: { ...drawn }, lost: { ...lost } });
out.results.kept = Object.keys(
  mergedResults({}, Object.fromEntries(Array.from({ length: 250 }, (_, i) => [`g${i}`, { at: i, players: [], winners: [], moves: 1 }]))),
).length;

// --- Five letters: the dealer picks the length, and only guesses as long as the word count ---

const fives = Array.from({ length: 200 }, (_, i) => dealt([ASHA, BEN], "a", 5, 1, 0, seeded(i + 1), 5).word);
t = table([ASHA, BEN], "stone", 1, 0);
const fourInFive = guess(t, "a", "tone", 1_000);
t = guess(t, "a", "notes", 1_000); // an anagram: all five letters in, but not the word
const fiveNote = play(t, 1_000).notes.at(-1);
t = guess(t, "b", "stone", 2_000);
out.fiveLetters = {
  lengths: [...new Set(fives.map((word) => word.length))],
  common: fives.every((word) => COMMON5.includes(word)),
  blocked: fives.some((word) => BLOCKED5.has(word)),
  fourInFive,
  fiveNote,
  wins: shown(play(t, 2_000)),
  // Sent to another phone, the guesses keep all five letters
  sent: received(message(t, 3_000), 3_000).moves.map((move) => move.word),
  fiveInFour: guess(table([ASHA, BEN], "stop", 1, 0), "a", "stone", 1_000),
};

console.log(JSON.stringify(out));
