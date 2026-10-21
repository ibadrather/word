<img src="web/icon.png" alt="WORD logo" width="96">

A phone notepad for a two-player 4-letter word guessing game, with an optional chess clock shared between two phones, and a group game for 2 to 4 phones.

**Play: https://ibadrather.github.io/word**

Install it from the browser (**Add to Home Screen**, or **Install app** on Android) to get an icon and offline play.

## Rules
1. Each player picks a secret 4-letter word.
2. Take turns guessing the other's word.
3. The other says how many letters of the guess are in their word. Position doesn't matter, and a repeated letter counts once.
4. First to guess the other's word wins, unless the other player then gets theirs on their last turn: that's a draw.

## Features
- Note your guesses and their scores, and colour letters red, yellow or green as you work them out.
- A dictionary of 4,983 four-letter words warns about guesses it doesn't know. The group game also knows 11,253 five-letter words.
- **Learn words** (in the menu) shows ten common dictionary words of 4 or 5 letters at random, with a button for ten more.
- Helper modes mark letters for you: **Basic** reds out letters from 0-score guesses, **Advanced** works out letters from all your guesses.
- **Duel clock**: a chess clock across two phones. Share a room link, and each guess passes the clock to the other player. A guess can only be noted on your turn; the first one is free for either player.
- In a duel, a guess that scores 4 can claim the win: the other phone is asked to confirm it, then both words are shown. If the other player has a turn left, they're asked only after their last guess, which can still draw. The sheet lists the wins of everyone who has played in the room, by name, and when the last game was played (UTC). Each phone keeps its own copy; when two phones meet, the one with the later game wins. Words lock once the clocks start; **New game** frees them and restarts both clocks.
- **Group game**: 2 to 4 phones in a room guess one word the computer deals, taking turns with a clock each. Anyone in the room picks 4 or 5 letters and the minutes, and every phone is told who switched; the letters can switch at any time, even during a game for the next word; the word is always a common one, never a crude one. Every guess is scored for you and shows on every phone. Only dictionary words count, never one already guessed. Once someone gets it, the players after them in the round get one last guess, so a draw is still possible. Running out of time or leaving puts you out. The room keeps a wins board by name that counts 4- and 5-letter wins together and shows how many of each.
- Everything stays on your phone. The duel clock and the group game are the only parts that go online, connecting the phones directly.

## Dev
```sh
python3 -m http.server -d web 8000   # preview at http://localhost:8000
uv run ruff format . && uv run ruff check . && uv run mypy tests .github/scripts && uv run pytest
```
Any change to `web/` needs a version bump (`uv version --bump patch`). Pushing a new version to `main` releases and deploys it. The `staging` branch is the beta at https://ibadrather.github.io/word/beta/, and other branches get a test copy under `/word/staging/<branch>/`.
