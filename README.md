# Word

A notepad for **Asna** and **Ibad**'s 4-letter word guessing game, opened in the phone's browser.

**Play: https://ibadrather.github.io/word**

## Rules
1. Each of you picks a secret 4-letter word.
2. Take turns guessing the other's word with any 4-letter word.
3. The other says how many letters of the guess are in their word. Where a letter sits doesn't matter, and a repeated letter counts once: against CART, TART scores 3 (T, A and R; the second T doesn't count again).
4. First to guess the other's word wins.

## What it does
You play face to face, saying guesses and scores out loud. The app never checks the secret words, whether a word is real, or the scores. It just helps you keep track:

- **Menu:** tap the logo for a short intro and the rules. Tap × or outside to close it.

- **Your word:** type your secret word at the bottom of the page. It's hidden as dots; tap **Show** to reveal it to the other player.
- **Note your guesses:** type the word, tap **0–4** for how many letters were correct. Tap **×** to remove one (asks first).
- **Mark letters:** tap a key to cycle it grey → **red** (not in it) → **yellow** (not sure) → **green** (in the word) → grey. Red comes first because most letters end up red.
- **Mode** (next to New game, asks to confirm). Letters a helper sets get a dot and are locked: tapping them does nothing.
  - **Normal Mode:** you mark every letter yourself.
  - **Basic Helper Mode:** every letter of a guess that scored 0 turns red.
  - **Advanced Helper Mode** (dark): works out letters from all your guesses' counts together. It tries every set of up to 4 letters the secret word could use; a letter in every set that fits is green, in none of them red. A line above the keyboard shows how many sets are left, and the letters once only one fits.
- **New game** clears everything, including your word.

Notes stay on each phone (browser storage), so a refresh or locked screen keeps them.

Browser storage belongs to the exact address. Notes made on https://ibadrather.github.io/word don't show up on a local server like `http://192.168.1.23:8501`, and the other way round. On a local server, a new IP from the router or another port also opens an empty page; the old notes are still there under the old address. Give the Pi a fixed IP in your router's settings so it always gets the same one.

## Deploy
Every push to `main` publishes `src/word/static/` to GitHub Pages (`.github/workflows/pages.yml`), live at https://ibadrather.github.io/word within a minute or so.

## Run locally
You can also serve it yourself on the home Wi-Fi. Needs [uv](https://docs.astral.sh/uv/) (on the Pi: `curl -LsSf https://astral.sh/uv/install.sh | sh`). Then:
```sh
uv run word            # or: uv run word -p 9000
```
It prints the address to open on each phone/laptop on the same Wi-Fi. To find the IP yourself:
- Mac: `ipconfig getifaddr en0`
- Raspberry Pi: `hostname -I`

### Mac: project on the iCloud Desktop
iCloud marks files inside `.venv` as hidden, and Python 3.14 then ignores them (`No module named 'word'`). Keep the venv in a folder iCloud skips, once:
```sh
rm -rf .venv && mkdir .venv.nosync && ln -s .venv.nosync .venv && uv sync
```
Or move the project out of `~/Desktop`.

## How it works
The page is a few static files, served by GitHub Pages or the local server. Everything else happens on the phone. Updates show up on the next refresh (GitHub Pages may cache for a few minutes). The Poppins font comes from Google Fonts, so a local game needs internet for it.
- `src/word/static/`: `index.html`, `style.css`, `app.js` (the page, saved in the browser's `localStorage`) and `helpers.js` (the helper logic). The favicon is inline in `index.html`; `icon.png` is only fetched when you add the page to an iPhone home screen.
- `src/word/__init__.py`: the `word` command, serving that folder with Python's built-in `http.server`.

## Dev
```sh
uv run ruff format . && uv run ruff check .   # all ruff rules enabled
uv run mypy src tests                         # strict typing
uv run pytest                                 # the helper tests need Node; they're skipped without it
```
`tests/games/` holds real games as JSON: the secret word, then each guess with its score and what the advanced helper should show after it (`green` letters and `letterSetsLeft`). Add a file there to test another game.
