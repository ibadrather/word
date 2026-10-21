"""The group game's logic agrees on every phone, whatever their clocks say."""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

NODE = shutil.which("node")
MINUTE = 60_000
ASHA, BEN, CLEO, DEV = "a", "b", "c", "d"
NOBODY_OUT: dict[str, str] = {}


def over(winners: list[str], out: dict[str, str] = NOBODY_OUT) -> dict[str, object]:
    """Show a game that has ended, as play() does."""
    return {"turn": None, "over": True, "winners": winners, "out": out}


def on(
    turn: str, winners: list[str] | None = None, out: dict[str, str] = NOBODY_OUT
) -> dict[str, object]:
    """Show a game still going, as play() does."""
    return {"turn": turn, "over": False, "winners": winners or [], "out": out}


@pytest.fixture(scope="module")
def steps() -> dict[str, dict[str, object]]:
    """Deal, guess, time out, leave, skip, merge and count as group_steps.mjs does."""
    assert NODE is not None
    result = subprocess.run(  # noqa: S603 - our own script, run with the local node
        [NODE, Path(__file__).parent / "group_steps.mjs"],
        capture_output=True,
        check=True,
        text=True,
    )
    steps: dict[str, dict[str, object]] = json.loads(result.stdout)
    return steps


pytestmark = pytest.mark.skipif(
    NODE is None, reason="needs Node to run the page's JavaScript"
)


def test_dealing(steps: dict[str, dict[str, object]]) -> None:
    """The dealer first, the others by phone id, 4 at most, from a common word."""
    assert steps["dealing"] == {
        # Eve was in the lobby too: the fifth phone has no seat
        "seats": [CLEO, ASHA, BEN, DEV],
        "sameOrder": [CLEO, ASHA, BEN, DEV],
        "game": "c:3",
        "minutes": 5,
        "common": True,
        "blocked": False,
        "alone": None,
        "noDealer": None,
        "noGame": True,
        "midGame": False,
    }


def test_guesses(steps: dict[str, dict[str, object]]) -> None:
    """Refused off turn, not a word or already on the table; scored without asking."""
    assert steps["guesses"] == {
        "offTurn": {"why": "turn", "who": ASHA},
        "notWord": {"why": "word"},
        # 20 s into the first turn, and nobody's clock has moved
        "free": {
            "turn": BEN,
            "left": {ASHA: MINUTE, BEN: MINUTE, CLEO: MINUTE},
            "notes": [
                {"seat": ASHA, "word": "bear", "count": 0, "at": 20_000, "won": False}
            ],
        },
        "yoursAgain": {"why": "again", "who": ASHA},
        # POTS scores 4 against STOP but isn't it; Ben's turn took 10 s
        "anagram": {
            "turn": CLEO,
            "winners": [],
            "note": {
                "seat": BEN,
                "word": "pots",
                "count": 4,
                "at": 30_000,
                "won": False,
            },
            "left": MINUTE - 10_000,
        },
        "theirsAgain": {"why": "again", "who": BEN},
        "stranger": {"why": "seat"},
    }


def test_time(steps: dict[str, dict[str, object]]) -> None:
    """A time-out needs no message, and the next clock starts right then."""
    assert steps["time"] == {
        "before": {"turn": BEN, "left": {ASHA: MINUTE, BEN: 1, CLEO: MINUTE}},
        # Ben's minute ran out at 61 s; 5 s later Cleo's clock has run 5 s
        "after": {
            **on(CLEO, out={BEN: "time"}),
            "left": {ASHA: MINUTE, BEN: 0, CLEO: MINUTE - 5_000},
            "due": [{"seat": BEN, "kind": "time", "used": MINUTE, "by": ""}],
        },
        # A guess that took longer than its player had left is dropped
        "late": 1,
        # Cleo's guess writes Ben's time-out in before it
        "afterOut": {
            "moves": [
                [ASHA, "guess", 1_000],
                [BEN, "time", MINUTE],
                [CLEO, "guess", 5_000],
            ],
            "turn": ASHA,
        },
    }


def test_last_one_with_time(steps: dict[str, dict[str, object]]) -> None:
    """The last player with time gets every turn, and still has to get the word."""
    assert steps["lastOne"] == {
        "turn": ASHA,
        "left": {ASHA: MINUTE - 2_000 - 7_000, BEN: 0},
        "nobody": {**over([], {BEN: "time", ASHA: "time"}), "time": 121_000},
        "wins": over([ASHA], {BEN: "time"}),
    }


def test_finishing_the_round(steps: dict[str, dict[str, object]]) -> None:
    """After the first winner, the seats after them get one last guess."""
    assert steps["round"] == {
        "firstSeat": {**on(BEN, [ASHA]), "lastGuesses": [BEN, CLEO, DEV]},
        "firstLast": {**on(CLEO, [ASHA]), "lastGuesses": [CLEO, DEV]},
        "middle": {**on(DEV, [CLEO]), "lastGuesses": [DEV]},
        # Dev got it too on his last guess: a draw
        "draw": over([CLEO, DEV]),
        "lastSeat": over([DEV]),
        "passedOver": over([CLEO], {DEV: "time"}),
    }


def test_leaving(steps: dict[str, dict[str, object]]) -> None:
    """Leave is out, on your turn or off it, and can end the round."""
    assert steps["leaving"] == {
        "ownTurn": {**on(CLEO, out={BEN: "left"}), "move": "leave"},
        "offIt": {**on(BEN, out={CLEO: "left"}), "quit": {CLEO: 1}},
        "offItLater": on(ASHA, out={CLEO: "left"}),
        "lastLeave": over([CLEO], {DEV: "left"}),
        "twice": True,
    }


def test_dropouts(steps: dict[str, dict[str, object]]) -> None:
    """An away player's turn is skipped after 30 s, or at once if still away."""
    assert steps["dropouts"] == {
        "skip": {
            "move": {"seat": BEN, "kind": "skip", "used": 30_000, "by": CLEO},
            "turn": CLEO,
            "left": MINUTE - 30_000,
        },
        "notTheirTurn": True,
        "atOnce": {"used": 0, "left": MINUTE - 30_000},
        # Back for his next turn, which took 7 s
        "back": {"turn": CLEO, "left": MINUTE - 37_000, "notes": 6},
    }


def test_received(steps: dict[str, dict[str, object]]) -> None:
    """A table crosses phones as elapsed time, and what arrives is checked."""
    assert steps["received"] == {
        "same": True,
        # Ben's phone got it a second late, so his clock shows a second more
        "ashaShows": 30_000,
        "benShows": 31_000,
        "bad": [None, None, None, None],
        # A fifth seat is dropped, and the moves stop at one of a kind nobody knows
        "odd": {"seats": 4, "moves": 1},
    }


def test_merging(steps: dict[str, dict[str, object]]) -> None:
    """Phones that missed each other's moves end up with the same table."""
    assert steps["merging"] == {
        "guessBeatsSkip": [
            [ASHA, "guess", "bear"],
            [BEN, "guess", "lion"],
            [CLEO, "guess", "cart"],
        ],
        "bothWays": True,
        "cleoKept": ["bear", "lion", "cart"],
        "twoSkips": {"same": True, "moves": 1},
        "laterDeal": ["b:2", "b:2"],
        # Asha and Cleo only reach each other through Ben. Each phone is behind
        # by the time its copy took to arrive (0.4 s, 0.2 s and none).
        "relay": {
            "same": True,
            "turn": [ASHA, ASHA, ASHA],
            "left": [MINUTE - 4_600, MINUTE - 4_800, MINUTE - 5_000],
        },
    }


def test_results(steps: dict[str, dict[str, object]]) -> None:
    """Every phone records the game; the board counts a lone winner only."""
    players = ["Asha", "Ben", "Cleo", "Dev"]
    assert steps["results"] == {
        "won": {
            "at": 9_000,
            "players": players,
            "winners": ["Cleo"],
            "moves": 4,
            "letters": 4,
        },
        "drawn": {
            "at": 8_000,
            "players": players,
            "winners": ["Cleo", "Dev"],
            "moves": 4,
            "letters": 4,
        },
        "lost": {
            "at": 300_000,
            "players": ["Asha", "Ben"],
            "winners": [],
            "moves": 4,
            "letters": 4,
        },
        "onGoing": None,
        # The entry with more moves wins, from either side
        "merged": {"games": ["g1", "g2"], "g1": ["Asha", "Ben"], "back": 6},
        "board": {
            "board": [
                {"name": "Cleo", "won": 1, "letters": {"4": 1, "5": 0}},
                {"name": "Asha", "won": 0, "letters": {"4": 0, "5": 0}},
                {"name": "Ben", "won": 0, "letters": {"4": 0, "5": 0}},
                {"name": "Dev", "won": 0, "letters": {"4": 0, "5": 0}},
            ],
            "at": 300_000,
        },
        # 4- and 5-letter wins on one board, each length counted
        "bothLengths": [
            {"name": "Cleo", "won": 2, "letters": {"4": 1, "5": 1}},
            {"name": "Asha", "won": 1, "letters": {"4": 1, "5": 0}},
            {"name": "Ben", "won": 0, "letters": {"4": 0, "5": 0}},
            {"name": "Dev", "won": 0, "letters": {"4": 0, "5": 0}},
        ],
        "kept": 200,
    }


def test_five_letters(steps: dict[str, dict[str, object]]) -> None:
    """A 5-letter deal is a common word; only 5-letter guesses count in it."""
    assert steps["fiveLetters"] == {
        "lengths": [5],
        "common": True,
        "blocked": False,
        "fourInFive": {"why": "word"},
        "fiveNote": {
            "seat": ASHA,
            "word": "notes",
            "count": 5,
            "at": 1_000,
            "won": False,
        },
        "wins": over([BEN]),
        "sent": ["notes", "stone"],
        "fiveInFour": {"why": "word"},
    }


def test_the_room_chooses_the_letters(steps: dict[str, dict[str, object]]) -> None:
    """Every phone deals with the room's letters and minutes, not its own.

    The latest pick wins; before anyone picks, or for picks made at once,
    the phone that has been in the room longest.
    """
    host = {"letters": 5, "minutes": 3}
    guest = {"letters": 4, "minutes": 10}
    assert steps["chosen"] == {
        "nobodyPicked": host,
        "guestPicked": guest,
        "hostPickedAgain": host,
        "sameTime": host,
    }


def test_a_game_stays_in_its_room() -> None:
    """A game saved from one room is dropped on joining another.

    Otherwise it would be recorded on the new room's wins board.
    """
    assert NODE is not None
    result = subprocess.run(  # noqa: S603 - our own script, run with the local node
        [NODE, Path(__file__).parent / "group_room_steps.mjs"],
        capture_output=True,
        check=True,
        text=True,
    )
    assert json.loads(result.stdout) == {
        "otherRoom": {"game": None, "played": ""},
        "sameRoom": {"game": "a:1", "played": "x"},
        "olderJoined": {"game": "a:1", "played": "x"},
        "olderTyped": {"game": None, "played": ""},
    }
