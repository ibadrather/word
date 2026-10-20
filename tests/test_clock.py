"""The duel clock's logic agrees on both phones, whatever their clocks say."""

import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

NODE = shutil.which("node")
MINUTE = 60_000


@pytest.mark.skipif(NODE is None, reason="needs Node to run the page's JavaScript")
def test_clock_steps() -> None:
    """Press, mirror, reorder, reset and show the clocks as clock_steps.mjs does."""
    assert NODE is not None
    result = subprocess.run(  # noqa: S603 - our own script, run with the local node
        [NODE, Path(__file__).parent / "clock_steps.mjs"],
        capture_output=True,
        check=True,
        text=True,
    )
    steps = json.loads(result.stdout)
    # A made-up room: two lowercase words and a number from 10 to 99
    assert re.fullmatch(r"[a-z]+-[a-z]+-[1-9][0-9]", steps["roomName"].pop("random"))
    assert steps == {
        "fresh": {
            "mine": 10 * MINUTE,
            "theirs": 10 * MINUTE,
            "ticking": False,
            "seq": 0,
        },
        # The first guess is free: 30 s later only player two's clock has moved
        "firstPress": {
            "running": "theirs",
            "mine": 10 * MINUTE,
            "theirs": 10 * MINUTE - 30_000,
            "seq": 1,
        },
        # Player two sees their own clock running; the press beats their fresh connect
        "mirrored": {"running": "mine", "adopted": True},
        "agree": [10 * MINUTE - 90_000, 10 * MINUTE - 90_000],
        # Player two answered 30 s in: their clock stopped at 9:30, and by the 60 s
        # mark player one's has run 24 s (25 s on player two's phone: a 1 s delay)
        "secondPress": {
            "oneRunning": "mine",
            "twoRunning": "theirs",
            "stoppedAt": [10 * MINUTE - 30_000, 10 * MINUTE - 30_000],
            "ticking": [10 * MINUTE - 24_000, 10 * MINUTE - 25_000],
        },
        "stale": {"adopt": False, "reply": True},
        # Exactly one side wins a tie, and a view is never newer than itself
        "tie": {"a": False, "b": True},
        "same": False,
        "reset": {
            "mine": 5 * MINUTE,
            "theirs": 5 * MINUTE,
            "running": None,
            "seq": 3,
            "newer": True,
        },
        "runOut": {"before": True, "after": False, "left": 0},
        "minutes": [10, 10, 60, 7, 60],
        "started": {
            "fresh": False,
            "pressed": True,
            "reset": False,
            "runOut": True,
            "paused": True,
            "pausedFresh": False,  # nobody had pressed: the first guess is still free
        },
        "inPlay": {
            "fresh": False,
            "ticking": True,
            "paused": True,
            "runOut": False,
            "pausedAtZero": False,
        },
        "playerName": ["Player one", "Player two"],
        "formatTime": ["0:00", "0:59", "1:00", "59:59", "1:00:00", "0:00"],
        # The host's fresh clock wins from both sides, so the joiner takes its
        # 10 minutes; the joiner's next press is seq 1 and wins as usual
        "host": {
            "hostKeeps": True,
            "joinerKeeps": False,
            "joinerAdopts": True,
            "minutes": 10 * MINUTE,
            "pressWins": True,
            "pressSeq": 1,
        },
        "roomName": {
            "first": "amber-acorn-10",
            "last": "zesty-zebra-99",
            "middle": "misty-panda-41",
            "longest": 16,  # within the room's 20 characters
            "words": [51, 53],
            "unique": True,
        },
        # Stopped where they were: 30 s off player one's own side, nothing running, and
        # a new view, so a phone rejoining at seq 0 adopts it and shows the same times
        "paused": {
            "mine": 7 * MINUTE - 30_000,
            "theirs": 8 * MINUTE,
            "running": None,
            "ticking": False,
            "seq": 5,
            "newer": True,
            "hostKeeps": True,
            "rejoinerAdopts": True,
            "rejoinerShows": [8 * MINUTE, 7 * MINUTE - 30_000],
        },
        "shareLink": [
            "https://ibadrather.github.io/word/?room=mint-owl-42",
            "http://localhost:8000/?room=mint-owl-42",
            "https://ibadrather.github.io/word/staging/feat-duel/index.html?room=a+b%26c",
        ],
        "roomFromLink": ["mint-owl-42", "mint-owl-42", "x" * 20, "", "", ""],
        "roundTrip": "a b&c",
        "latestWins": {
            "theirsLater": {"players": {"Asha": 2, "Ben": 2, "Cleo": 1}, "at": 9_000},
            "oursLater": {"players": {"Asha": 2, "Ben": 1}, "at": 5_000},
            "same": {"players": {"Asha": 2, "Ben": 1}, "at": 5_000},
            "olderPhone": {"players": {"Asha": 2, "Ben": 1}, "at": 5_000},
        },
        "counted": {
            "won": {"players": {"Asha": 2, "Ben": 1, "Cleo": 1}, "at": 6_000},
            "drawn": {
                "players": {"Asha": 2, "Ben": 1, "Cleo": 1, "Dev": 0},
                "at": 7_000,
            },
            "first": {"players": {"P1": 0, "P2": 1}, "at": 1},
        },
        # Most wins first, a tie by name
        "board": [
            {"name": "Asha", "won": 2},
            {"name": "Ben", "won": 1},
            {"name": "Cleo", "won": 1},
        ],
        # Undoing a win takes one off, and its time is past the tally's even
        # when this phone's clock reads earlier, so the other phone adopts it
        "uncounted": {
            "undone": {"players": {"Asha": 2, "Ben": 1, "Cleo": 0}, "at": 9_000},
            "behind": 6_001,
            "adopted": {"players": {"Asha": 2, "Ben": 1, "Cleo": 0}, "at": 9_000},
            "none": {"Asha": 2, "Ben": 1, "Cleo": 1},
        },
    }
