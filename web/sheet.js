// What the duel's and the group game's sheets and docks share: the sheet folding away, the room field, sending a
// room's link, the time a game was played, the room's wins, the clocks' times, the line on the dock's edge, and chips
// that pick one of a few values (Learn words has some too).

import { ask } from "./ask.js";
import { create } from "./dom.js";
import { formatTime } from "./helpers.js";
import { shareLink } from "./room.js";

const COPIED = 2_000; // how long a Share link button says "Link copied", in ms
export const MINUTE_CHIPS = [3, 5, 10, 15, 30]; // the minutes each a sheet offers

const copiedTimers = new WeakMap(); // Share link button → the timer that puts its label back

// A sheet (or the menu) folds away from any of `closers` (its ×, Not now) or a tap on the dimmed page around it
export function closable(dialog, ...closers) {
  for (const closer of closers) closer.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
}

// One chip for each of `values` into `chips`, labelled by `label`: tapping one calls `onPick` with its value
export function addChips(chips, values, onPick, label = String) {
  for (const value of values) {
    const chip = create("button", { type: "button", textContent: label(value) });
    chip.dataset.value = value;
    chip.addEventListener("click", () => onPick(value));
    chips.append(chip);
  }
}

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
  clearTimeout(copiedTimers.get(button));
  copiedTimers.set(button, setTimeout(() => (button.textContent = "Share link"), COPIED));
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

// A clock's time left, rounded up: 0:00 only once the time is really gone
export const clockTime = (ms) => formatTime(ms + 999);

// The line on a dock's top edge (`el`): its text, its dot ("live", "wait" or "" for hollow) and whether it's a warning
export function showEdgeNote(el, { text, dot = "", warn = false }) {
  el.hidden = !text;
  el.classList.toggle("warn", warn);
  el.firstElementChild.className = `dot ${dot}`;
  el.lastElementChild.textContent = text;
}

// A moment as 2026-10-18 21:40 UTC, the same on every phone wherever it is
export const utc = (ms) => `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;

// The room's wins in a line for the menu, this phone's player (`me`) as You: "Wins: You 2 · Sam 1"
export const winsLine = (board, me) =>
  board.length ? `Wins: ${board.map(({ name, won }) => `${name === me ? "You" : name} ${won}`).join(" · ")}` : "No wins here yet";

// The room's wins into `list`, one row a player who has played here, this phone's player (`me`) marked, and when the
// last game was played into `when`. A group game's row also says how many of the wins were of 4 letters and of 5.
export function showWins(list, when, board, me, playedAt) {
  const rows = board.map(({ name, won, letters }) => {
    const li = create("li");
    li.classList.toggle("me", name === me);
    li.append(create("span", { textContent: name }));
    if (letters) {
      const split = Object.entries(letters).map(([length, count]) => `${length} letters: ${count}`);
      li.append(create("em", { textContent: split.join(" · ") }));
    }
    li.append(create("b", { textContent: won }));
    return li;
  });
  list.replaceChildren(...rows);
  when.textContent = playedAt ? `Last played ${utc(playedAt)}` : "No games played here yet";
}
