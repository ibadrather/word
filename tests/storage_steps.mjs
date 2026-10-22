// Reads saves that are missing, damaged or from storage that's turned off, and prints what came back: node storage_steps.mjs
// The browser is stood in for: storage is a plain object, or one that throws, and with no secure context no room opens.
const store = {};
const working = { getItem: (key) => store[key] ?? null, setItem: (key, value) => (store[key] = value) };
const broken = {
  getItem() {
    throw new Error("storage is off");
  },
  setItem() {
    throw new Error("storage is off");
  },
};
globalThis.localStorage = working;
globalThis.document = { addEventListener() {} };
globalThis.addEventListener = () => {};
globalThis.isSecureContext = false;

const { readObject, readText, writeObject } = await import("../web/storage.js");
const clock = await import("../web/clock.js");
const group = await import("../web/group.js");

// What readObject() gives for `saved` as the stored text
function read(saved) {
  store.key = saved;
  return readObject("key");
}

writeObject("written", { a: 1 });
const roundTrip = readObject("written");

globalThis.localStorage = broken;
const off = { object: readObject("key"), text: readText("key"), write: writeObject("key", { a: 1 }) ?? null };
globalThis.localStorage = working;

// The duel's and the group game's view after loading `saved` as their save: the parts the page draws from
function clockView(saved) {
  store["word-clock"] = saved;
  clock.init(() => {}, () => {});
  const v = clock.view();
  return { board: v.board, minutes: v.minutes, mine: v.mine.left };
}
function groupView(saved) {
  store["word-group"] = saved;
  group.init(() => {});
  const v = group.view();
  return { board: v.board, colours: group.book().colours, letters: v.letters };
}

console.log(
  JSON.stringify({
    missing: read(undefined),
    damaged: read("{not json"),
    array: read("[1, 2]"),
    number: read("5"),
    text: read('"abc"'),
    nothing: read("null"),
    object: read('{"a": 1}'),
    roundTrip,
    off,
    clockDamaged: clockView('{"wins": null, "minutes": 3}'),
    groupDamaged: groupView('{"results": null, "book": "x", "letters": 5}'),
  }),
);
