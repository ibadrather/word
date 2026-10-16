<img src="web/icon.png" alt="WORD logo" width="96">

A phone notepad for a two-player 4-letter word guessing game, with an optional chess clock shared between two phones.

**Play: https://ibadrather.github.io/word**

Install it from the browser (**Add to Home Screen**, or **Install app** on Android) to get an icon and offline play.

## Rules
1. Each player picks a secret 4-letter word.
2. Take turns guessing the other's word.
3. The other says how many letters of the guess are in their word. Position doesn't matter, and a repeated letter counts once.
4. First to guess the other's word wins.

## Features
- Note your guesses and their scores, and colour letters red, yellow or green as you work them out.
- A dictionary of 4,983 words warns about guesses it doesn't know.
- Helper modes mark letters for you: **Basic** reds out letters from 0-score guesses, **Advanced** works out letters from all your guesses.
- **Duel clock**: a chess clock across two phones. Share a room link, and each guess passes the clock to the other player.
- Everything stays on your phone. The duel clock is the only part that goes online, connecting the two phones directly.

## Dev
```sh
python3 -m http.server -d web 8000   # preview at http://localhost:8000
uv run ruff format . && uv run ruff check . && uv run mypy tests .github/scripts && uv run pytest
```
Any change to `web/` needs a version bump (`uv version --bump patch`). Pushing a new version to `main` releases and deploys it. The `staging` branch is the beta at https://ibadrather.github.io/word/beta/, and other branches get a test copy under `/word/staging/<branch>/`.
