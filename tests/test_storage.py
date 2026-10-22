"""A save that is missing, damaged or can't be reached never breaks the page."""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

NODE = shutil.which("node")


@pytest.mark.skipif(NODE is None, reason="needs Node to run the page's JavaScript")
def test_saves_fall_back_to_a_fresh_start() -> None:
    """Anything but a saved object reads as {}, and storage turned off never throws.

    The duel and the group game load a save with damaged parts as fresh ones.
    """
    assert NODE is not None
    result = subprocess.run(  # noqa: S603 - our own script, run with the local node
        [NODE, Path(__file__).parent / "storage_steps.mjs"],
        capture_output=True,
        check=True,
        text=True,
    )
    assert json.loads(result.stdout) == {
        "missing": {},
        "damaged": {},
        "array": {},
        "number": {},
        "text": {},
        "nothing": {},
        "object": {"a": 1},
        "roundTrip": {"a": 1},
        "off": {"object": {}, "text": None, "write": None},
        "clockDamaged": {"board": [], "minutes": 3, "mine": 600_000},
        "groupDamaged": {"board": [], "colours": {}, "letters": 5},
    }
