// Joins a group game room with a game saved from before and prints which game the phone is in: node group_room_steps.mjs
// The browser is stood in for: storage is a plain object, and with no secure context the room is never opened.
const store = {};
globalThis.localStorage = { getItem: (key) => store[key] ?? null, setItem: (key, value) => (store[key] = value) };
globalThis.document = { addEventListener() {} };
globalThis.addEventListener = () => {};
globalThis.isSecureContext = false;

const group = await import("../web/group.js");

const ASHA = { id: "a", name: "Asha" };
const BEN = { id: "b", name: "Ben" };
const table = group.dealt([ASHA, BEN], "a", 5, 1, 0);

// The page loaded with `saved`, then Connect tapped with the room typed: the game it's in after, and the room saved
// with it
function joining(saved) {
  store["word-group"] = JSON.stringify({ id: "a", name: "Asha", ...saved });
  group.init(() => {});
  group.connect("Asha", saved.room);
  const { played } = JSON.parse(store["word-group"]);
  return { game: group.view().table?.game ?? null, played };
}

console.log(
  JSON.stringify({
    // Played in x, then y typed on the setup screen: x's game is never y's
    otherRoom: joining({ room: "y", played: "x", joined: false, table }),
    sameRoom: joining({ room: "x", played: "x", joined: false, table }),
    // A save from before the room was kept with the game: the room it's joined to is the game's
    olderJoined: joining({ room: "x", joined: true, table }),
    olderTyped: joining({ room: "y", joined: false, table }),
  }),
);
