"""The page's word lists, by length, read once per test run."""

import functools
import re
from pathlib import Path

WEB = Path(__file__).parent.parent / "web"
LETTERS = (4, 5)
SOURCES = {4: "words.js", 5: "words5.js"}  # the dictionaries by length
COMMON_SOURCES = {4: "common.js", 5: "common5.js"}  # the common words by length


@functools.cache
def source(name: str) -> str:
    """Read a file of the page."""
    return (WEB / name).read_text()


@functools.cache
def entries(name: str) -> tuple[str, ...]:
    """Read the words from a word list's string lines."""
    lines = re.findall(r'^ {2}"([a-z ]+)",$', source(name), re.MULTILINE)
    return tuple(" ".join(lines).split(" "))
