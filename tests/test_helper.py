"""The helpers work out the right letters for real games played in tests/games/."""

import json
import shutil
import subprocess
from pathlib import Path
from typing import TypedDict

import pytest

GAMES = sorted((Path(__file__).parent / "games").glob("*.json"))
NODE = shutil.which("node")
LEARN_WORDS = 10  # how many the Learn words sheet shows
COMMON_FILES = {4: "common.js", 5: "common5.js"}  # the common words by length


class Guess(TypedDict):
    """One guess, its score, and what the advanced helper should show after it."""

    word: str
    count: int
    green: str
    letterSetsLeft: int
    wordsLeft: int


class Game(TypedDict):
    """A secret word and the guesses made at it, in order."""

    secret: str
    guesses: list[Guess]


def load(path: Path) -> Game:
    """Read a game file."""
    game: Game = json.loads(path.read_text())
    return game


@pytest.mark.parametrize("path", GAMES, ids=[path.stem for path in GAMES])
def test_scores_match_the_secret(path: Path) -> None:
    """Each score is the guess's letters found in the secret (repeats count once)."""
    game = load(path)
    for guess in game["guesses"]:
        shared = set(guess["word"]) & set(game["secret"])
        assert len(shared) == guess["count"], guess["word"]


@pytest.mark.skipif(NODE is None, reason="needs Node to run the page's JavaScript")
@pytest.mark.parametrize("path", GAMES, ids=[path.stem for path in GAMES])
def test_advanced_helper(path: Path) -> None:
    """After each guess, the advanced helper shows the expected greens and counts.

    The page scores each guess against the secret as the game file does, too.
    """
    assert NODE is not None
    result = subprocess.run(  # noqa: S603 - our own script, run with the local node
        [NODE, Path(__file__).parent / "helper_steps.mjs", path],
        capture_output=True,
        check=True,
        text=True,
    )
    expected = [
        {
            "word": g["word"],
            "score": g["count"],
            "green": g["green"],
            "letterSetsLeft": g["letterSetsLeft"],
            "wordsLeft": g["wordsLeft"],
        }
        for g in load(path)["guesses"]
    ]
    assert json.loads(result.stdout) == expected


@pytest.mark.skipif(NODE is None, reason="needs Node to run the page's JavaScript")
@pytest.mark.parametrize("letters", COMMON_FILES)
def test_learn_words_are_ten_different_dictionary_words(letters: int) -> None:
    """Learn words shows ten words, all different, all common dictionary words."""
    assert NODE is not None
    script = (
        'import { isWord, randomWords } from "./web/helpers.js";'
        f'import {{ COMMON }} from "./web/{COMMON_FILES[letters]}";'
        f"const words = randomWords({LEARN_WORDS}, Math.random, {letters});"
        "const known = (w) => isWord(w) && COMMON.includes(w);"
        "console.log(JSON.stringify(words.map((w) => [w, known(w)])));"
    )
    result = subprocess.run(  # noqa: S603 - our own code, run with the local node
        [NODE, "--input-type=module", "-e", script],
        capture_output=True,
        check=True,
        text=True,
        cwd=Path(__file__).parent.parent,
    )
    words = json.loads(result.stdout)
    assert len({word for word, _ in words}) == LEARN_WORDS
    assert all(known for _, known in words)
    assert all(len(word) == letters for word, _ in words)


@pytest.mark.skipif(NODE is None, reason="needs Node to run the page's JavaScript")
@pytest.mark.parametrize(("letters", "crude"), [(4, "rape"), (5, "whore")])
def test_blocked_words_are_never_picked(letters: int, crude: str) -> None:
    """The blocked words are common words, and no pick ever includes one.

    Asked for every common word, with a fixed random, the picks are every
    common word but the blocked ones, each once.
    """
    assert NODE is not None
    script = (
        'import { isWord, randomWords } from "./web/helpers.js";'
        f'import {{ BLOCKED, COMMON }} from "./web/{COMMON_FILES[letters]}";'
        "let seed = 1;"
        "const random = () => (seed = (seed * 48271) % 2147483647) / 2147483647;"
        f"const words = randomWords(COMMON.length, random, {letters});"
        "console.log(JSON.stringify({"
        "  blocked: [...BLOCKED],"
        "  notCommon: [...BLOCKED].filter((w) => !COMMON.includes(w) || !isWord(w)),"
        "  picked: words.length,"
        "  different: new Set(words).size,"
        "  pickedBlocked: words.filter((w) => BLOCKED.has(w)),"
        "  common: COMMON.length,"
        "}));"
    )
    result = subprocess.run(  # noqa: S603 - our own code, run with the local node
        [NODE, "--input-type=module", "-e", script],
        capture_output=True,
        check=True,
        text=True,
        cwd=Path(__file__).parent.parent,
    )
    steps = json.loads(result.stdout)
    assert crude in steps["blocked"]
    assert steps["notCommon"] == []  # no typos: each one is a common, guessable word
    assert steps["pickedBlocked"] == []
    assert steps["picked"] == steps["different"]
    assert steps["picked"] == steps["common"] - len(steps["blocked"])
