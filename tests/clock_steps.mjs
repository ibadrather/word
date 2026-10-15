// Plays the two-player clock's pure logic through a game and prints what each step showed: node clock_steps.mjs
// Times are ms on each phone's own clock; player two's phone runs 7 seconds ahead of player one's throughout.
import { clampMinutes, formatTime, fresh, left, message, mirrored, newer, pressed, reset, started, ticking } from "../web/clock.js";

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

// The first guess is free until either clock starts; a reset makes it free again, and a side at 0 counts as started
out.started = {
  fresh: started(fresh(10)),
  pressed: started(pressed(fresh(10), 5_000, "one")),
  reset: started(reset(pressed(fresh(10), 5_000, "one"), 10, 9_000, "one")),
  runOut: started({ ...fresh(10), mine: 0 }),
};

// Times as the dock and the game show them: m:ss, h:mm:ss past an hour, never below 0:00
out.formatTime = [0, 59_999, 60_000, 3_599_000, 3_600_000, -5_000].map(formatTime);

console.log(JSON.stringify(out));
