# Word

A notepad for **Asna** and **Ibad**'s 4-letter word guessing game, opened in the phone's browser over the home Wi-Fi.

## What it does
You play the game out loud: each of you picks a secret word and tells the other how many letters their guess got right. The app never checks the secret words. It just helps you keep track:

- **Your word:** type your secret word at the bottom of the page. It's hidden as dots; tap **Show** to reveal it to the other player.
- **Note your guesses:** type the word, tap **0–4** for how many letters were correct.
- **Mark letters:** tap a key to cycle it grey → **red** (not in it) → **yellow** (not sure) → **green** (in the word) → grey. Red comes first because most letters end up red.
- **Mode** (next to New game, asks to confirm). Letters a helper sets get a dot and are locked: tapping them does nothing.
  - **Normal Mode:** you mark every letter yourself.
  - **Basic Helper Mode:** every letter of a guess that scored 0 turns red.
  - **Advanced Helper Mode** (dark): works out letters from all your guesses' counts together. It tries every set of up to 4 letters the secret word could use; a letter in every set that fits is green, in none of them red.
- **New game** clears everything, including your word.

Notes stay on each phone (browser storage), so a refresh or locked screen keeps them. The server only hands out the page; after that each phone works on its own.

## Run
Needs [uv](https://docs.astral.sh/uv/) (on the Pi: `curl -LsSf https://astral.sh/uv/install.sh | sh`). Then:
```sh
uv run guess-word            # or: uv run guess-word -p 9000
```
It prints the address to open on each phone/laptop on the same Wi-Fi. To find the IP yourself:
- Mac: `ipconfig getifaddr en0`
- Raspberry Pi: `hostname -I`

### Mac: project on the iCloud Desktop
iCloud marks files inside `.venv` as hidden, and Python 3.14 then ignores them (`No module named 'guess_word'`). Keep the venv in a folder iCloud skips, once:
```sh
rm -rf .venv && mkdir .venv.nosync && ln -s .venv.nosync .venv && uv sync
```
Or move the project out of `~/Desktop`.

## How it works
The server only hands out three static files; once a phone has them, it never talks to the server again.
- `src/guess_word/static/`: `index.html`, `style.css` and `app.js` (plain HTML/CSS/JS, saved in the browser's `localStorage`).
- `src/guess_word/__init__.py`: the `guess-word` command, serving that folder with Python's built-in `http.server`.

## Dev
```sh
uv run ruff format . && uv run ruff check .   # all ruff rules enabled
uv run mypy src tests                         # strict typing
uv run pytest
```
