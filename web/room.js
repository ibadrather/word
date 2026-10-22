// The room the phones meet in. Trystero (trystero.js) finds the other phones through public Nostr relays, then the
// phones talk directly over WebRTC. This is the only file that loads the library, and only once a room is opened, so a
// problem in it can never reach the normal game. The pure functions at the top are what the tests run in Node; the
// rest needs the browser, but nothing here touches it until it's called.

const APP_ID = "ibadrather-word";
const REJOIN_AFTER = 60_000; // back after this long away, a phone may have lost its connection: the mode decides

// A room made up for you, like mint-owl-42: words that are easy to say across a table and to spell, and a number.
// The longest result has 6 + 6 letters and 4 more, well inside the room's 20.
export const ADJECTIVES = [
  "amber", "brave", "breezy", "bright", "calm", "cheery", "clever", "cosmic", "crisp", "eager", "fancy", "fluffy", "fresh",
  "frosty", "fuzzy", "gentle", "giddy", "glad", "golden", "green", "happy", "jazzy", "jolly", "keen", "kind", "lively",
  "lucky", "mellow", "mighty", "mint", "misty", "nimble", "olive", "peachy", "polite", "proud", "quick", "royal", "rusty",
  "shiny", "silver", "sleepy", "smart", "snowy", "snug", "steady", "swift", "tidy", "velvet", "witty", "zesty",
];
export const NOUNS = [
  "acorn", "badger", "bison", "camel", "cedar", "cobra", "comet", "crab", "daisy", "duck", "eagle", "falcon", "finch",
  "fox", "frog", "gecko", "goose", "hippo", "kitten", "kiwi", "koala", "lark", "lemur", "lion", "lotus", "mango", "maple",
  "melon", "mole", "moth", "mouse", "newt", "otter", "owl", "panda", "parrot", "pony", "puffin", "rabbit", "raven",
  "rhino", "robin", "shark", "sloth", "squid", "swan", "tiger", "tulip", "turtle", "vole", "walrus", "yak", "zebra",
];
export function roomName(random = Math.random) {
  const pick = (words) => words[Math.floor(random() * words.length)];
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}-${10 + Math.floor(random() * 90)}`;
}

// A room as typed or linked: trimmed, lowercase and at most 20 characters
export const cleanRoom = (typed) => typed.trim().toLowerCase().slice(0, 20);

// The link that opens this page on a room: the page's own address with ?room= (or another `param`), any other query
// or hash dropped
export function shareLink(href, room, param = "room") {
  const url = new URL(href);
  url.search = new URLSearchParams({ [param]: room }).toString();
  url.hash = "";
  return url.href;
}

// The room in a page's query string, as the link carries it under `param`; "" when there's none
export const roomFromLink = (search, param = "room") => cleanRoom(new URLSearchParams(search).get(param) ?? "");

// --- The room in the browser ---

// Joins roomId and makes an action for each of `channels`. What happens in it goes to the handlers: ready() once
// joined, failed() if the library couldn't load or join, peerJoin(id) and peerLeave(id) as phones come and go, and
// message(channel, data, id). A room that has been closed reports nothing more, even if it's still being left in the
// background or was still loading, so its events are never taken for the room a phone is in now.
export function open(roomId, channels, handlers) {
  let room = null; // Trystero's room, once joined
  let actions = {};
  let closed = false;
  const peers = new Set();
  const live = (handler) => (...args) => closed || handler(...args);

  (async () => {
    try {
      const { joinRoom } = await import("./trystero.js");
      if (closed) return; // closed while the library loaded
      room = joinRoom({ appId: APP_ID }, roomId);
      actions = Object.fromEntries(channels.map((channel) => [channel, room.makeAction(channel)]));
    } catch {
      return void (closed || handlers.failed());
    }
    handlers.ready();
    room.onPeerJoin = live((id) => {
      peers.add(id);
      handlers.peerJoin(id);
    });
    room.onPeerLeave = live((id) => {
      peers.delete(id);
      handlers.peerLeave(id);
    });
    for (const channel of channels) {
      actions[channel].onMessage = live((data, { peerId }) => handlers.message(channel, data, peerId));
    }
  })();

  return {
    // To one phone, or to every phone in the room when `to` is left out. Nothing is sent before the room is joined. A
    // send that fails, at once or later, is dropped: the phones share their state again on the next change.
    send(channel, data, to) {
      if (closed || !actions[channel]) return;
      try {
        actions[channel].send(data, { target: to }).catch(() => {});
      } catch {}
    },
    // The room is left in the background, after a goodbye ({ channel, data, to }, if one is given) has gone or half
    // a second has passed: a send that fails or hangs never keeps it open
    close(goodbye) {
      if (closed) return;
      closed = true;
      if (!room) return;
      const action = goodbye && actions[goodbye.channel];
      const sent = action ? Promise.resolve().then(() => action.send(goodbye.data, { target: goodbye.to })) : Promise.resolve();
      const halfSecond = new Promise((resolve) => setTimeout(resolve, 500));
      Promise.race([sent, halfSecond])
        .catch(() => {})
        .finally(() => room.leave().catch(() => {}));
    },
    // The peer ids of the phones here now
    peers: () => new Set(peers),
  };
}

// Back from a locked phone or another app: a message may have been missed, or the connection dropped. `away` says the
// page was out of view for over a minute; a quick trip away, like the share sheet while sending the link, isn't.
export function onVisible(handler) {
  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return void (hiddenAt = Date.now());
    handler({ away: Date.now() - hiddenAt > REJOIN_AFTER });
  });
}
