// The page's own questions and notes: a small card in the middle of the screen, in place of the browser's confirm(),
// alert() and prompt(). One shows at a time; one asked while another is open waits its turn.

const $ = (id) => document.getElementById(id);
let queue = Promise.resolve();

// Resolves true for `yes`, false for `no` or Escape. With `no: null` it's a note with one button. `word`, if any,
// shows under the text as tiles.
export function ask(text, { yes = "OK", no = "Cancel", word = "" } = {}) {
  const answer = queue.then(() => show(text, yes, no, word));
  queue = answer;
  return answer;
}

function show(text, yes, no, word) {
  const dialog = $("ask");
  $("ask-text").textContent = text;
  $("ask-word").hidden = !word;
  $("ask-word").ariaLabel = word;
  $("ask-word").replaceChildren(...[...word].map((letter) => Object.assign(document.createElement("b"), { textContent: letter })));
  $("ask-yes").textContent = yes;
  $("ask-no").textContent = no ?? "";
  $("ask-no").hidden = !no;
  dialog.returnValue = "";
  dialog.showModal();
  return new Promise((resolve) => dialog.addEventListener("close", () => resolve(dialog.returnValue === "yes"), { once: true }));
}
