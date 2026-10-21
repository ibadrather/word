// What the duel's and the group game's sheets share: the room field, sending a room's link, the time a game was
// played, the room's wins, and chips that pick one of a few values (Learn words has some too).

import { ask } from "./ask.js";
import { shareLink } from "./room.js";

const COPIED = 2_000; // how long a Share link button says "Link copied", in ms

// Share link sends the page's address with the room, under `param` (?room= for the duel, ?group= for the group game).
// The phone's share sheet first; without one, the clipboard; failing that, a box to copy it from.
export async function share(button, room, param, text) {
  const url = shareLink(location.href, room, param);
  if (navigator.share) {
    try {
      return await navigator.share({ title: "Word", text, url });
    } catch (error) {
      if (error.name === "AbortError") return; // the player closed the share sheet
    }
  }
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    return ask(`Copy this link: ${url}`, { no: null });
  }
  button.textContent = "Link copied";
  clearTimeout(button.copied);
  button.copied = setTimeout(() => (button.textContent = "Share link"), COPIED);
}

// A room field lowercased as it's typed, with the cursor kept where it was: its value
export function lowercase(input) {
  const lower = input.value.toLowerCase();
  if (lower !== input.value) {
    const at = input.selectionStart;
    input.value = lower;
    input.setSelectionRange(at, at);
  }
  return input.value;
}

// The chip in `chips` whose data-value is `value` shows as picked, and only it
export function press(chips, value) {
  for (const chip of chips.children) chip.ariaPressed = String(chip.dataset.value === String(value));
}

// A moment as 2026-10-18 21:40 UTC, the same on every phone wherever it is
export const utc = (ms) => `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;

// The room's wins into `list`, one row a player who has played here, this phone's player (`me`) marked, and when the
// last game was played into `when`. A group game's row also says how many of the wins were of 4 letters and of 5.
export function showWins(list, when, board, me, playedAt) {
  const rows = board.map(({ name, won, letters }) => {
    const li = document.createElement("li");
    li.classList.toggle("me", name === me);
    li.append(Object.assign(document.createElement("span"), { textContent: name }));
    if (letters) {
      const split = Object.entries(letters).map(([length, count]) => `${length} letters: ${count}`);
      li.append(Object.assign(document.createElement("em"), { textContent: split.join(" · ") }));
    }
    li.append(Object.assign(document.createElement("b"), { textContent: won }));
    return li;
  });
  list.replaceChildren(...rows);
  when.textContent = playedAt ? `Last played ${utc(playedAt)}` : "No games played here yet";
}
