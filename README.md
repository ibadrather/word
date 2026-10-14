<img src="web/icon.png" alt="WORD logo" width="96">

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

Notes stay on each phone (browser storage), so a refresh or locked screen keeps them. They belong to the exact address, so notes made on a local preview (below) don't show up on the live site, and the other way round.

## How it works
The page is a few static files in `web/`, served by GitHub Pages. Everything happens on the phone; the page never talks back to a server. The Poppins font comes from Google Fonts.
- `web/`: `index.html`, `style.css`, `app.js` (the page, saved in the browser's `localStorage`) and `helpers.js` (the helper logic). The favicon is inline in `index.html`; `icon.png` is only fetched when you add the page to an iPhone home screen.

## Versions and releases
The version lives in `pyproject.toml` and shows at the bottom of the menu (a local preview shows `dev`). Any change to `web/` needs a higher version, or the **Version bump** check fails. Bump it with:
```sh
uv version --bump patch   # 1.0.0 -> 1.0.1: fixes; minor for new features, major for big changes
```
Pushing a new version to `main` runs **Release** (`.github/workflows/release.yml`): CI, then a `v<version>` tag and GitHub release with notes, then the deploy of that version to https://ibadrather.github.io/word, live within a minute or so. Phones may keep the old files for up to 10 minutes; a refresh after that picks up the update. To republish without a new version, run **Deploy to GitHub Pages** by hand from the Actions tab.

**CI** (`.github/workflows/ci.yml`) runs the checks below on every push and pull request that touches the page, tests or tooling.

## Dev
Preview changes before pushing (`app.js` is a module, so opening `index.html` as a file doesn't work):
```sh
python3 -m http.server -d web 8000
```
Open http://localhost:8000, or `http://<mac-ip>:8000` on a phone on the same Wi-Fi (`ipconfig getifaddr en0`). This server doesn't stop the browser caching, so after an edit hard-refresh (Cmd+Shift+R) or tick DevTools → Network → Disable cache.

Checks need Python 3.14+ and the dev tools in `pyproject.toml`. [uv](https://docs.astral.sh/uv/) is recommended: it fetches the right Python and the tools on the first run.
```sh
uv run ruff format . && uv run ruff check .   # all ruff rules enabled
uv run mypy tests .github/scripts             # strict typing
uv run pytest                                 # the helper tests need Node; they're skipped without it
```
Without uv, make a venv with Python 3.14 (the Mac's built-in `python3` is older) and drop the `uv run` prefix:
```sh
python3.14 -m venv .venv && source .venv/bin/activate
pip install --group dev                       # pip 25.1+, which Python 3.14 ships with
ruff format . && ruff check . && mypy tests .github/scripts && pytest
```
`tests/games/` holds real games as JSON: the secret word, then each guess with its score and what the advanced helper should show after it (`green` letters and `letterSetsLeft`). Add a file there to test another game.
