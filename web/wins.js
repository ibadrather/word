// A room's wins, kept by player name, and what players are called before they give one. Pure functions, so the tests
// run them in Node.

// A room's wins: { players: { name: games won }, at: when its last game ended, in UTC ms }. Everyone who has played
// in the room is listed, whoever they played. When the two phones' tallies differ, the one whose last game ended
// later is kept on both.
export const NO_WINS = { players: {}, at: 0 };
export function latestWins(ours, sent) {
  const at = Number(sent?.at) || 0;
  if (at <= (ours?.at ?? 0)) return ours;
  const players = Object.entries(sent.players ?? {}).map(([name, won]) => [String(name).slice(0, 12), Number(won) || 0]);
  return { players: Object.fromEntries(players), at };
}

// After a game between two players: both listed, the winner (if it wasn't a draw) with one more win
export function counted(wins, players, winner, at) {
  const tally = { ...wins.players };
  for (const name of players) tally[name] ??= 0;
  if (winner) tally[winner] += 1;
  return { players: tally, at };
}

// A win both players agreed to undo: one fewer for the winner. It counts as later than the tally it changes, even on a
// phone whose clock is behind the other's, so the other phone adopts it.
export function uncounted(wins, winner, now) {
  const tally = { ...wins.players };
  if (tally[winner]) tally[winner] -= 1;
  return { players: tally, at: Math.max(now, wins.at + 1) };
}

// The room's players, most wins first, then by name
export const board = (wins) =>
  Object.entries(wins.players)
    .map(([name, won]) => ({ name, won }))
    .sort((a, b) => b.won - a.won || a.name.localeCompare(b.name));

// What a player is called until their phone sends a name, by seat: seat 0 is player one
const SEATS = ["Player one", "Player two", "Player three", "Player four"];
export const playerName = (seat) => SEATS[seat];
