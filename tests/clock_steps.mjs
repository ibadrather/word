// Plays the duel clock's pure logic through a game and prints what each step showed: node clock_steps.mjs
// Times are ms on each phone's own clock; player two's phone runs 7 seconds ahead of player one's throughout.
import {
  ADJECTIVES,
  NOUNS,
  NO_WINS,
  board,
  clampMinutes,
  counted,
  fresh,
  inPlay,
  latestWins,
  left,
  message,
  mirrored,
  newer,
  paused,
  phoneId,
  playerName,
  pressed,
  reset,
  roomFromLink,
  roomName,
  shareLink,
  started,
  ticking,
  turn,
  uncounted,
} from "../web/clock.js";
import { formatTime } from "../web/helpers.js";

const out = {};
const ahead = (oneTime) => oneTime + 7_000; // the same moment on player two's phone

// Player one connects: a fresh 10-minute clock, nothing running, at seq 0 so it gives way to any game in progress
let one = { ...fresh(10), at: 1_000, by: "one" };
out.fresh = { mine: left(one, "mine", 1_000), theirs: left(one, "theirs", 1_000), ticking: ticking(one, 1_000), seq: one.seq };

// The first guess is free: player one's clock stays full while player two's starts
one = pressed(one, 5_000, "one");
out.firstPress = { running: one.running, mine: left(one, "mine", 35_000), theirs: left(one, "theirs", 35_000), seq: one.seq };

// Player two gets the message a second later and mirrors it onto their own clock
let two = mirrored(message(one, 6_000, "Player one", 10), ahead(6_000));
out.mirrored = { running: two.running, adopted: newer(two, { ...fresh(10), at: ahead(2_000), by: "two" }) };

// 90 seconds after the press both phones show the same time left, each by its own clock
out.agree = [left(one, "theirs", 95_000), left(two, "mine", ahead(95_000))];

// Player two answers 30 seconds in: their clock stops, player one's starts
two = pressed(two, ahead(35_000), "two");
one = mirrored(message(two, ahead(35_000), "Player two", 10), 36_000);
out.secondPress = {
  oneRunning: one.running,
  twoRunning: two.running,
  stoppedAt: [left(one, "theirs", 60_000), left(two, "mine", ahead(60_000))],
  ticking: [left(one, "mine", 60_000), left(two, "theirs", ahead(60_000))],
};

// A stale copy of player one's first press arrives late: it is older, so player two answers with their own view
const stale = mirrored(message(pressed({ ...fresh(10), at: 1_000, by: "one" }, 5_000, "one"), 6_000, "Player one", 10), ahead(6_000));
out.stale = { adopt: newer(stale, two), reply: newer(two, stale) };

// Both press at once: the same seq from both sides, and both phones pick the same winner
const a = pressed(one, 70_000, "one");
const b = pressed(two, ahead(70_000), "two");
out.tie = { a: newer(a, mirrored(message(b, ahead(70_000), "", 10), 70_000)), b: newer(b, mirrored(message(a, 70_000, "", 10), ahead(70_000))) };
out.same = newer(a, a); // nothing to send back

// New game with the clocks stopped, or a change of minutes: both back to full
const again = reset(one, 5, 80_000, "one");
out.reset = { mine: again.mine, theirs: again.theirs, running: again.running, seq: again.seq, newer: newer(again, one) };

// A clock that has run out counts as stopped and reads 0:00, never less
const late = { mine: 1_000, theirs: 1_000, running: "mine", at: 0, seq: 1, by: "one" };
out.runOut = { before: ticking(late, 500), after: ticking(late, 1_000), left: left(late, "mine", 5_000) };

out.minutes = [clampMinutes(0, 10), clampMinutes(Number.NaN, 10), clampMinutes(100, 10), clampMinutes(7.4, 10), clampMinutes(60, 10)];

// The first guess is free until either clock starts; a reset makes it free again, a side at 0 counts as started, and
// so do clocks stopped by a player leaving once one has run
out.started = {
  fresh: started(fresh(10), 10),
  pressed: started(pressed(fresh(10), 5_000, "one"), 10),
  reset: started(reset(pressed(fresh(10), 5_000, "one"), 10, 9_000, "one"), 10),
  runOut: started({ ...fresh(10), mine: 0 }, 10),
  paused: started(paused(pressed(fresh(10), 5_000, "one"), 35_000, "one"), 10),
  pausedFresh: started(paused(fresh(10), 35_000, "one"), 10),
};

// Restarting the clocks asks first while a game is going on them: ticking, or stopped by a player leaving. Not
// before the first guess, and not once a clock has run out, as the game on them is over.
const inGame = pressed(fresh(10), 5_000, "one");
out.inPlay = {
  fresh: inPlay(fresh(10), 10, 9_000),
  ticking: inPlay(inGame, 10, 9_000),
  paused: inPlay(paused(inGame, 9_000, "one"), 10, 20_000),
  runOut: inPlay(inGame, 10, 5_000 + 10 * 60_000),
  pausedAtZero: inPlay(paused({ ...inGame, theirs: 1_000 }, 9_000, "one"), 10, 20_000),
};

out.playerName = [playerName(true), playerName(false)];

// Times as the dock and the game show them: m:ss, h:mm:ss past an hour, never below 0:00
out.formatTime = [0, 59_999, 60_000, 3_599_000, 3_600_000, -5_000].map(formatTime);

// Player two types player one's room and picked 5 minutes: both start fresh at seq 0, and the host's view wins on both
// phones, though player two's own id ("zz") would beat player one's ("aa") on its own
const host = { ...fresh(10), at: 1_000, by: phoneId(true, "aa") };
const joiner = { ...fresh(5), at: ahead(2_000), by: phoneId(false, "zz") };
const joinerSees = mirrored(message(host, 3_000, "Player one", 10), ahead(3_000));
out.host = {
  hostKeeps: newer(host, mirrored(message(joiner, ahead(3_000), "Player two", 5), 3_000)),
  joinerKeeps: newer(joiner, joinerSees),
  joinerAdopts: newer(joinerSees, joiner),
  minutes: left(joinerSees, "mine", ahead(3_000)),
};
// Once adopted, the joiner's first press is seq 1 and wins on the host's phone as any press does
const joinerPress = pressed(joinerSees, ahead(10_000), phoneId(false, "zz"));
out.host.pressWins = newer(mirrored(message(joinerPress, ahead(10_000), "Player two", 10), 10_000), host);
out.host.pressSeq = joinerPress.seq;

// Made-up rooms: the same draws give the same room, the first and last words and numbers are in reach,
// and even the two longest words with the number fit the room's 20 characters
const draws = (...values) => () => values.shift();
out.roomName = {
  first: roomName(draws(0, 0, 0)),
  last: roomName(draws(0.999_999, 0.999_999, 0.999_999)),
  middle: roomName(draws(0.6, 0.66, 0.35)),
  random: roomName(),
  longest: Math.max(...ADJECTIVES.map((word) => word.length)) + Math.max(...NOUNS.map((word) => word.length)) + "--99".length,
  words: [ADJECTIVES.length, NOUNS.length],
  unique: new Set([...ADJECTIVES, ...NOUNS]).size === ADJECTIVES.length + NOUNS.length,
};

// Player two taps Leave while player one's clock has run 30 s: player one's phone stops both clocks where they are
const running = { mine: 7 * 60_000, theirs: 8 * 60_000, running: "mine", at: 100_000, seq: 4, by: "two" };
const stopped = paused(running, 130_000, phoneId(true, "aa"));
// Player two connects again later with a fresh clock at seq 0 and gets player one's message: it adopts the stopped
// clocks, and player one keeps them
const rejoiner = { ...fresh(10), at: ahead(200_000), by: phoneId(false, "zz") };
const rejoinerSees = mirrored(message(stopped, 200_000, "Player one", 10), ahead(200_000));
// Whose guess is next: either player's before the first, then the other side's after each press, seen the same from
// both phones. It stays put while both clocks are stopped, rejoined or not, and a reset frees it again. A view from an
// older version has no turn, so its running clock says.
out.turn = {
  fresh: turn(fresh(10)),
  firstPress: turn(pressed(fresh(10), 5_000, "one")),
  mirrored: turn(mirrored(message(pressed(fresh(10), 5_000, "one"), 6_000, "", 10), ahead(6_000))),
  paused: turn(stopped),
  rejoiner: turn(rejoinerSees),
  reset: turn(reset(stopped, 10, 300_000, "one")),
  olderVersion: turn(mirrored({ ...message(running, 130_000, "", 10), turn: undefined }, ahead(130_000))),
};
out.paused = {
  mine: left(stopped, "mine", 200_000),
  theirs: left(stopped, "theirs", 200_000),
  running: stopped.running,
  ticking: ticking(stopped, 200_000),
  seq: stopped.seq,
  newer: newer(stopped, running),
  hostKeeps: newer(stopped, mirrored(message(rejoiner, ahead(200_000), "Player two", 10), 200_000)),
  rejoinerAdopts: newer(rejoinerSees, rejoiner),
  rejoinerShows: [left(rejoinerSees, "mine", ahead(260_000)), left(rejoinerSees, "theirs", ahead(260_000))],
};

// Share link: the page's own path with only ?room=, and a room that needs it encoded
out.shareLink = [
  shareLink("https://ibadrather.github.io/word/?x=1#a", "mint-owl-42"),
  shareLink("http://localhost:8000/", "mint-owl-42"),
  shareLink("https://ibadrather.github.io/word/staging/feat-duel/index.html", "a b&c"),
];

// A link's room, cleaned up as a typed one is; "" when there's none
out.roomFromLink = ["?room=mint-owl-42", "?room=MINT-OWL-42", `?room=${"x".repeat(30)}`, "", "?x=1", "?room="].map(
  roomFromLink,
);
out.roundTrip = roomFromLink(new URL(shareLink("https://ibadrather.github.io/word/", "a b&c")).search);

// The room's wins, by name: the tally whose last game ended later is kept on both phones
const ours = { players: { Asha: 2, Ben: 1 }, at: 5_000 };
out.latestWins = {
  theirsLater: latestWins(ours, { players: { Asha: 2, Ben: 2, Cleo: 1 }, at: 9_000 }),
  oursLater: latestWins(ours, { players: {}, at: 1_000 }),
  same: latestWins(ours, { players: { Ben: 9 }, at: 5_000 }),
  olderPhone: latestWins(ours, undefined),
};
// A new player joins the room later: listed after their first game, a draw adds no win
let wins = counted(ours, ["Cleo", "Ben"], "Cleo", 6_000);
out.counted = { won: wins, drawn: counted(wins, ["Asha", "Dev"], undefined, 7_000), first: counted(NO_WINS, ["P1", "P2"], "P2", 1) };
out.board = board(wins);
// Both players agree to undo Cleo's win: one fewer, and later than the tally even on a phone whose clock is behind,
// so the other phone adopts it. A name with no wins (or none at all) stays at 0.
const undone = uncounted(wins, "Cleo", 9_000);
out.uncounted = {
  undone,
  behind: uncounted(wins, "Cleo", 1_000).at,
  adopted: latestWins(wins, undone),
  none: uncounted(wins, "Dev", 9_000).players,
};

console.log(JSON.stringify(out));
