// Fills each <div data-game> with the page below the header, as main draws it, with a sample game in progress.
// data-game="empty" draws a fresh game with no guesses; data-word="seat" shows a guess being typed on the page's keyboard.

const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const COLOURS = { l: "out", i: "out", o: "out", n: "out", m: "out", a: "in", r: "unsure", e: "unsure" };
const NOTES = [["rate", 3, "3:10"], ["team", 2, "1:52"], ["lion", 0, "0:40"]];

const BACKSPACE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 5H9l-6 7 6 7h12z"/><path d="M17 9l-5 6M12 9l5 6"/></svg>';
const RESET_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5"/></svg>';
window.CLOCK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5"/><path d="M9 2h6"/></svg>';

// The header exactly as on main; `extra` goes between the mode pill and New game
window.header = (extra = "", helper = "Normal Mode") => `
  <header>
    <button class="logo" type="button"><b class="unsure">W</b><b class="out">O</b><b>R</b><b class="in">D</b></button>
    <select class="mode"><option>${helper}</option></select>
    ${extra}
    <button class="new-game" type="button">${RESET_ICON}<span>New</span></button>
  </header>`;

function game(el) {
  const empty = el.dataset.game === "empty";
  const word = el.dataset.word || "";
  const colours = empty ? {} : COLOURS;
  const keys = ROWS.map((row, i) => `<div class="row">${[...row].map((l) => `<button class="key ${colours[l] || ""}">${l}</button>`).join("")}${i === 2 ? `<button class="key back">${BACKSPACE_ICON}</button>` : ""}</div>`).join("");
  const slots = [0, 1, 2, 3].map((i) => `<span class="${i === word.length ? "next" : ""}">${word[i] || ""}</span>`).join("");
  const notes = empty
    ? '<li class="empty">No guesses yet. Type one above and tap its score.</li>'
    : NOTES.map(([w, count, at]) => `<li>${[...w].map((l) => `<button class="tile ${colours[l] || ""}">${l}</button>`).join("")}<span class="at">${at}</span><span class="score">${count}</span><button class="delete">×</button></li>`).join("");
  el.outerHTML = `
    ${el.dataset.timer === "off" ? "" : `<p class="timer">${empty ? "0:12" : "0:41"}</p>`}
    ${el.dataset.before ? window[el.dataset.before] : ""}
    <p class="slots">${slots}</p>
    <p class="label">How many letters are right?</p>
    <div class="counts ${word.length === 4 ? "ready" : ""}">${[0, 1, 2, 3, 4].map((n) => `<button>${n}</button>`).join("")}</div>
    <p class="msg"></p>
    <div class="keyboard">${keys}</div>
    <p class="legend">Tap guessed letters: <span><i class="out"></i>not in</span><span><i class="unsure"></i>not sure</span><span><i class="in"></i>in word</span></p>
    <button class="clear" ${empty ? "disabled" : ""}>Clear</button>
    <div class="guesses-head"><h2>Your guesses</h2><p class="game-stats"><span>Guesses: <b>${empty ? 0 : 3}</b></span><span>Game Timer: <b>${empty ? "0:12" : "3:51"}</b></span></p></div>
    <ul class="notes">${notes}</ul>
    <h2>Your secret word</h2>
    <div class="secret"><input type="password" value="cart"><button class="pill">Show</button></div>
    <p class="msg"></p>`;
}

// The two clocks; `turn` is "mine" or "theirs"
window.clocks = (turn, mine = "7:42", theirs = "8:15", who = "Player two") => `
  <div class="clocks duel-clocks">
    <div class="clock ${turn === "mine" ? "running" : ""}"><span class="who">You</span><b>${mine}</b><span class="turn">${turn === "mine" ? "Your turn" : ""}</span></div>
    <div class="clock ${turn === "theirs" ? "running" : ""}"><span class="who">${who}</span><b>${theirs}</b><span class="turn">${turn === "theirs" ? "Their turn" : ""}</span></div>
  </div>`;

// Runs once the page's own script has named its pieces: data-header="name" and data-before="name" are window globals
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-header]").forEach((el) => (el.outerHTML = header(el.dataset.header ? window[el.dataset.header] : "")));
  document.querySelectorAll("[data-game]").forEach(game);
});
