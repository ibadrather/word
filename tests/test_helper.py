"""The helpers work out the right letters for real games played in tests/games/.

Games of 4 letters and of 5 (the group game's), and made-up ones checked
against a slow, plain version of the advanced helper written here.
"""

import json
import random
import shutil
import subprocess
from itertools import combinations
from pathlib import Path
from string import ascii_lowercase
from typing import TypedDict

import pytest
from word_lists import COMMON_SOURCES, LETTERS, SOURCES, entries

GAMES = sorted((Path(__file__).parent / "games").glob("*.json"))
NODE = shutil.which("node")
LEARN_WORDS = 10  # how many the Learn words sheet shows


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


class Step(TypedDict):
    """What the advanced helper shows after a guess, as helper_steps.mjs prints it."""

    word: str
    score: int
    green: str
    red: str
    letterSetsLeft: int
    found: str
    wordsLeft: int


def load(path: Path) -> Game:
    """Read a game file."""
    game: Game = json.loads(path.read_text())
    return game


def run_steps(path: Path) -> list[Step]:
    """Play a game file through the page's helper with helper_steps.mjs."""
    assert NODE is not None
    result = subprocess.run(  # noqa: S603 - our own script, run with the local node
        [NODE, Path(__file__).parent / "helper_steps.mjs", path],
        capture_output=True,
        check=True,
        text=True,
    )
    steps: list[Step] = json.loads(result.stdout)
    return steps


def plain_helper(
    secret: str, guesses: list[str], colours: dict[str, str]
) -> list[Step]:
    """Work out what the advanced helper shows the slow, plain way, to check the page's.

    Every set of 1 to len(secret) letters that gives each guess its score is
    kept. A letter in all of them is green, in none red. Marks other than
    "unsure" narrow the sets, but never the letter's own mark, and when they
    leave none the scores alone count.
    """
    dictionary = entries(SOURCES[len(secret)])
    sets = [
        frozenset(chosen)
        for size in range(1, len(secret) + 1)
        for chosen in combinations(ascii_lowercase, size)
    ]
    marks = {
        letter: colour == "in"
        for letter, colour in colours.items()
        if colour != "unsure"
    }

    def marked(pool: list[frozenset[str]], skipped: str) -> list[frozenset[str]]:
        return [
            s
            for s in pool
            if all((m in s) == is_in for m, is_in in marks.items() if m != skipped)
        ]

    steps: list[Step] = []
    guessed: set[str] = set()
    for word in guesses:
        count = len(set(word) & set(secret))
        guessed.add(word)
        sets = [s for s in sets if len(set(word) & s) == count]
        unmarked = marked(sets, "")  # for a letter without a mark of its own
        known: dict[str, str] = {}
        for letter in ascii_lowercase:
            pool = (marked(sets, letter) if letter in marks else unmarked) or sets
            if pool and all(letter in s for s in pool):
                known[letter] = "in"
            elif pool and not any(letter in s for s in pool):
                known[letter] = "out"
        fitting = set(sets)
        left = sum(
            1 for w in dictionary if w not in guessed and frozenset(w) in fitting
        )
        steps.append(
            {
                "word": word,
                "score": count,
                "green": "".join(sorted(k for k, v in known.items() if v == "in")),
                "red": "".join(sorted(k for k, v in known.items() if v == "out")),
                "letterSetsLeft": len(sets),
                "found": "".join(sorted(sets[0])) if len(sets) == 1 else "",
                "wordsLeft": left,
            }
        )
    return steps


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
    steps = run_steps(path)
    assert [{key: step[key] for key in expected[0]} for step in steps] == expected  # type: ignore[literal-required]


def test_games_cover_both_lengths() -> None:
    """There's a real game of each length the page plays."""
    assert {len(load(path)["secret"]) for path in GAMES} == set(LETTERS)


@pytest.mark.skipif(NODE is None, reason="needs Node to run the page's JavaScript")
@pytest.mark.parametrize("path", GAMES, ids=[path.stem for path in GAMES])
def test_real_games_match_the_plain_helper(path: Path) -> None:
    """The game files' greens and counts are what the plain helper works out."""
    game = load(path)
    assert run_steps(path) == plain_helper(
        game["secret"], [g["word"] for g in game["guesses"]], {}
    )


def made_up_game(letters: int, seed: int) -> tuple[str, list[str], dict[str, str]]:
    """Make up a secret, seven guesses ending with it, and marks.

    An odd seed adds a wrong mark.
    """
    rng = random.Random(seed)  # noqa: S311 - a repeatable game, not a secret
    words = entries(COMMON_SOURCES[letters])
    secret = rng.choice(words)
    guesses = [*[w for w in rng.sample(words, 7) if w != secret][:6], secret]
    inside = sorted(set(secret))
    outside = sorted(set(ascii_lowercase) - set(secret))
    colours = {rng.choice(inside): "in", rng.choice(outside): "out"}
    colours[rng.choice(outside)] = "unsure"
    if seed % 2:  # a mark the scores will contradict
        colours[rng.choice(inside)] = "out"
    return secret, guesses, colours


@pytest.mark.skipif(NODE is None, reason="needs Node to run the page's JavaScript")
@pytest.mark.parametrize("letters", LETTERS)
@pytest.mark.parametrize("seed", range(4))
def test_made_up_games_match_the_plain_helper(
    letters: int, seed: int, tmp_path: Path
) -> None:
    """Random games of 4 and 5 letters, with marks, agree with the plain helper.

    The secret always stays among the words left until it's guessed, and
    with only right marks the letters the helper settles are right about it.
    """
    secret, guesses, colours = made_up_game(letters, seed)
    path = tmp_path / "game.json"
    notes = [{"word": w, "count": len(set(w) & set(secret))} for w in guesses]
    path.write_text(
        json.dumps({"secret": secret, "guesses": notes, "colours": colours})
    )
    steps = run_steps(path)
    assert steps == plain_helper(secret, guesses, colours)
    truthful = seed % 2 == 0  # no mark the scores contradict
    for step in steps[:-1]:
        assert step["wordsLeft"] >= 1
        if truthful:
            assert set(step["green"]) <= set(secret)
            assert not set(step["red"]) & set(secret)


@pytest.mark.skipif(NODE is None, reason="needs Node to run the page's JavaScript")
def test_letter_search_finds_every_word_with_the_letters() -> None:
    """Learn words' search lists every word with all the letters.

    The 4-letter words come first, then the 5-letter ones.
    """
    assert NODE is not None
    script = (
        'import { wordsWith } from "./web/helpers.js";'
        'console.log(JSON.stringify(wordsWith([..."zqu"])))'
    )
    result = subprocess.run(  # noqa: S603 - our own code, run with the local node
        [NODE, "--input-type=module", "-e", script],
        capture_output=True,
        check=True,
        cwd=Path(__file__).parent.parent,
        text=True,
    )
    expected = [
        word
        for letters in LETTERS
        for word in entries(SOURCES[letters])
        if {"z", "q", "u"} <= set(word)
    ]
    assert expected
    assert json.loads(result.stdout) == expected
