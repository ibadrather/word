// Picks the duel's minutes before and after connecting and prints what the sheet shows: node clock_room_steps.mjs
// The browser is stood in for: storage is a plain object, and with no secure context the room is never opened.
const store = {};
globalThis.localStorage = { getItem: (key) => store[key] ?? null, setItem: (key, value) => (store[key] = value) };
globalThis.document = { addEventListener() {} };
globalThis.isSecureContext = false;

const clock = await import("../web/clock.js");

clock.init(() => {}, () => {});
const shown = () => {
  const v = clock.view();
  return { minutes: v.minutes, mine: v.mine.left, started: v.started };
};

clock.setMinutes(5);
const setUp = { ...shown(), saved: JSON.parse(store["word-clock"]).minutes };
clock.connect("", "family");
const connected = shown();
clock.setMinutes(3);
const changed = shown();

console.log(JSON.stringify({ setUp, connected, changed }));
