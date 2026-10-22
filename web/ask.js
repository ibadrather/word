// The page's own questions and notes: a small card in the middle of the screen, in place of the browser's confirm(),
// alert() and prompt(). One shows at a time; one asked while another is open waits its turn.

const $ = (id) => document.getElementById(id);
let queue = Promise.resolve();

// Resolves true for `yes`, false for `no` or Escape. With `no: null` it's a note with one button. `word`, if any,
// shows under the text as tiles, and `meaning` (text, or a promise of it) under the word. `danger` paints `yes` red,
// for a step like leaving a game.
export function ask(text, { yes = "OK", no = "Cancel", word = "", meaning = "", danger = false } = {}) {
  const answer = queue.then(async () => show(text, yes, no, word, await meaning, danger));
  queue = answer;
  return answer;
}

function show(text, yes, no, word, meaning, danger) {
  const dialog = $("ask");
  $("ask-text").textContent = text;
  $("ask-word").hidden = !word;
  $("ask-word").ariaLabel = word;
  $("ask-word").replaceChildren(...[...word].map((letter) => Object.assign(document.createElement("b"), { textContent: letter })));
  $("ask-meaning").textContent = meaning;
  $("ask-meaning").hidden = !meaning;
  $("ask-yes").textContent = yes;
  $("ask-yes").classList.toggle("danger", danger);
  $("ask-no").textContent = no ?? "";
  $("ask-no").hidden = !no;
  dialog.returnValue = "";
  dialog.showModal();
  return new Promise((resolve) => dialog.addEventListener("close", () => resolve(dialog.returnValue === "yes"), { once: true }));
}
