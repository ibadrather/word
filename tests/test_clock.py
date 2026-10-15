"""The two-player clock's logic agrees on both phones, whatever their clocks say."""

import json
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
    assert json.loads(result.stdout) == {
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
        "started": {"fresh": False, "pressed": True, "reset": False, "runOut": True},
        "formatTime": ["0:00", "0:59", "1:00", "59:59", "1:00:00", "0:00"],
    }
