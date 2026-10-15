<img src="web/icon.png" alt="WORD logo" width="96">

# Word

A notepad for a two-player 4-letter word guessing game (player one and player two), opened in the phone's browser, with an optional chess clock shared between the two phones.

**Play: https://ibadrather.github.io/word**

## Install it as an app
Installed, it gets its own icon, opens full-screen without the browser bar, and works with no connection.
- **Android** (Chrome): open the page, then tap **Install app** when offered, or ⋮ → **Add to Home screen** → **Install**.
- **iPhone** (Safari, or Chrome on iOS 16.4+): Share → **Add to Home Screen**.
- **Mac**: in Safari (macOS Sonoma or later), File → **Add to Dock**; in Chrome or Edge, the install icon at the right of the address bar. Firefox can't install it.

The installed app keeps its own notes, apart from the browser's, so a game in progress in the browser doesn't carry over. On iPhone that's a plus: Safari may clear a site's notes after 7 days without a visit, but not a home-screen app's.

## Rules
1. Each of you picks a secret 4-letter word.
2. Take turns guessing the other's word with any 4-letter word.
3. The other says how many letters of the guess are in their word. Where a letter sits doesn't matter, and a repeated letter counts once: against CART, TART scores 3 (T, A and R; the second T doesn't count again).
4. First to guess the other's word wins.

## What it does
You play face to face, saying guesses and scores out loud. The app never checks the scores or shows anyone's word, and talks to no server of ours. It just helps you keep track:

- **Menu:** tap the logo for a short intro, the rules and how many words the dictionary knows. Tap × or outside to close it.

- **Your word:** type your secret word at the bottom of the page. It's hidden as dots; tap **Show** to reveal it to the other player.
- **Note your guesses:** type the word, tap **0–4** for how many letters were correct. Tap **×** to remove one (asks first).
- **Dictionary:** a guess or secret word that isn't one of its 4,983 four-letter words gets a red "Not in the dictionary". It's only a warning: you can still note the guess.
- **Mark letters:** tap a key to cycle it grey → **red** (not in it) → **yellow** (not sure) → **green** (in the word) → grey. Red comes first because most letters end up red.
- **Clear** (next to the colour key, asks first): wipes the colours you set on the keys, in any mode. Letters a helper set stay as they are.
- **Mode** (next to New game, asks to confirm). Letters a helper sets get a dot and are locked: tapping them does nothing.
  - **Normal Mode:** you mark every letter yourself.
  - **Basic Helper Mode:** every letter of a guess that scored 0 turns red.
  - **Advanced Helper Mode** (dark): works out letters from all your guesses' counts together. It tries every set of up to 4 letters the secret word could use; a letter in every set that fits is green, in none of them red. A line above the keyboard shows how many dictionary words and letter sets are left, and the letters once only one set fits. It counts words but never shows one.
- **New game** clears everything, including your word.
- **Timer** (from the first New game): under the header, the time since your last guess (since New game before the first one). Beside **Your guesses**, the number of guesses and the game time, as `Guesses: 3  Game Timer: 12:34`. Each guess also shows when in the game it was noted.
- **Two-player clock** (in the menu): a chess clock shared between the two phones. Both players type their name and the same room name (pick one nobody else would), set the minutes each (10 by default) and tap **Connect**. Under the timer, a line says who is connected, with a dot that fills in green, and the two clocks sit below it. Noting a guess stops your clock and starts the other player's; the first guess is free, so both clocks sit at the full time until it. A clock that runs out shows a red `0:00`; nothing stops you playing on. **New game** before the first guess restarts both clocks; while one is running it asks whether to restart them too. Changing the minutes restarts both (it asks first if a clock is running). The room is remembered, so a refresh, a locked phone or a dropped connection rejoins on its own and the phones agree again within a moment. **Leave** switches the mode off; the other phone then says you left. Both phones need internet to find each other; after that they talk directly, even on the same Wi-Fi.

Notes stay on each phone (browser storage), so a refresh or locked screen keeps them. They belong to the exact address, so notes made on a local preview (below) don't show up on the live site, and the other way round. An installed app keeps its own, too.

## How it works
The page is a few static files in `web/`, served by GitHub Pages. Everything happens on the phone; the page never talks back to a server of ours, and loads nothing from other sites.
- `web/`: `index.html`, `style.css`, `app.js` (the page, saved in the browser's `localStorage`), `helpers.js` (the helper logic), `words.js` (the dictionary) and `clock.js` (the two-player clock, with its own saved state apart from the game's).
- The two-player clock is the one thing that goes online. Joining a room talks to a handful of public [Nostr](https://nostr.com) relays to find the other phone (a few KB of encrypted connection offers; the relays see each phone's address and the phones keep a socket to them while in the room), then the phones talk to each other directly over WebRTC's encrypted data channel, through public STUN servers to get past home routers. One message of about 100 bytes per guess, reset or reconnection. `trystero.js` is [Trystero](https://github.com/dmotz/trystero) 0.26.0 (MIT) bundled once with the command in its first line; the relay list is fixed inside it, so if those relays shut down the clock stops finding phones until the file is rebuilt. Clocks run on wall-clock time from the last press, each phone counting elapsed time with its own clock, so the phones' clocks don't need to agree and a dropout changes nothing.
- `fonts/`: Poppins (Latin letters only), from Google Fonts under the Open Font License in `fonts/OFL.txt`.
- Installing: `manifest.webmanifest` names the app and its icons. `icon.png` is the iPhone and Mac icon; `icon-192.png` and `icon-512.png` are Android's, and `icon-maskable.png` has room around the tiles for Android to crop it to a circle or any other shape. The favicon is inline in `index.html`.
- `sw.js`, the service worker, keeps a copy of every file so the page opens offline. It still fetches each file from the network when it can, so updates arrive as before and the copies are only used offline. Its `FILES` list must name every file in `web/`; a test checks it.

## The dictionary
`web/words.js` holds every 4-letter word the page accepts, about 13 KB once compressed. It comes from [SCOWL](http://wordlist.aspell.net) 2020.12.07, the word lists behind most English spellcheckers. It keeps sizes up to 80 ("words found in larger dictionaries") in British (including Oxford's -ize spelling) and American spellings, and drops names, abbreviations and accented words. The file's header lists the exact lists used and carries SCOWL's copyright notice, which its licence asks to keep. Oxford's own dictionary isn't openly licensed, so this is the closest open stand-in.

## Versions and releases
The version lives in `pyproject.toml` and shows at the bottom of the menu (a local preview shows `dev`). Any change to `web/` needs a higher version, or the **Version bump** check fails. Bump it with:
```sh
uv version --bump patch   # 1.0.0 -> 1.0.1: fixes; minor for new features, major for big changes
```
Pushing a new version to `main` runs **Release** (`.github/workflows/release.yml`): CI, then a `v<version>` tag and GitHub release with notes, then the deploy of that version to https://ibadrather.github.io/word, live within a minute or so. Phones may keep the old files for up to 10 minutes; a refresh after that (or, for the installed app, closing and reopening it) picks up the update. To republish without a new version, run **Deploy to GitHub Pages** by hand from the Actions tab.

**CI** (`.github/workflows/ci.yml`) runs the checks below on every push and pull request that touches the page, tests or tooling.

## Dev
Preview changes before pushing (`app.js` is a module, so opening `index.html` as a file doesn't work):
```sh
python3 -m http.server -d web 8000
```
Open http://localhost:8000, or `http://<mac-ip>:8000` on a phone on the same Wi-Fi (`ipconfig getifaddr en0`). This server doesn't stop the browser caching, so after an edit hard-refresh (Cmd+Shift+R) or tick DevTools → Network → Disable cache.

The two-player clock needs https or `localhost` (its library uses the browser's crypto, which plain http pages don't get), so test it in two `localhost` windows (Safari and Chrome, or two Chrome profiles), or on phones via the live site. On `http://<mac-ip>:8000` the page says the clock needs the https site and the rest works as usual.

Checks need Python 3.14+ and the dev tools in `pyproject.toml`. [uv](https://docs.astral.sh/uv/) is recommended: it fetches the right Python and the tools on the first run.
```sh
uv run ruff format . && uv run ruff check .   # all ruff rules enabled
uv run mypy tests .github/scripts             # strict typing
uv run pytest                                 # the helper and clock tests need Node; they're skipped without it
```
Without uv, make a venv with Python 3.14 (the Mac's built-in `python3` is older) and drop the `uv run` prefix:
```sh
python3.14 -m venv .venv && source .venv/bin/activate
pip install --group dev                       # pip 25.1+, which Python 3.14 ships with
ruff format . && ruff check . && mypy tests .github/scripts && pytest
```
`tests/games/` holds real games as JSON: the secret word, then each guess with its score and what the advanced helper should show after it (`green` letters, `letterSetsLeft` and `wordsLeft`). Add a file there to test another game. `tests/clock_steps.mjs` plays the clock's logic through a game between two phones whose clocks differ by 7 seconds; `tests/test_clock.py` checks what each step shows.
