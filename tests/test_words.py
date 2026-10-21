"""The dictionaries in web/words.js and web/words5.js are clean.

The 4-letter one knows the secrets in tests/games/. Their common words in
web/common.js and web/common5.js, for Learn words and the group game's deal,
are clean too.
"""

import json
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).parent.parent
LETTERS = (4, 5)
SOURCES = {4: "words.js", 5: "words5.js"}
COMMON_SOURCES = {4: "common.js", 5: "common5.js"}


def source(name: str) -> str:
    """Read a file of the page."""
    return (ROOT / "web" / name).read_text()


def entries(text: str) -> list[str]:
    """Read the words from a word list's string lines."""
    return " ".join(re.findall(r'^ {2}"([a-z ]+)",$', text, re.MULTILINE)).split(" ")


@pytest.mark.parametrize("letters", LETTERS)
def test_words_are_lowercase_letters(letters: int) -> None:
    """Every entry is 4 (or 5) letters a-z, so lookups of a typed word work."""
    words = entries(source(SOURCES[letters]))
    assert all(re.fullmatch(f"[a-z]{{{letters}}}", word) for word in words)


@pytest.mark.parametrize("letters", LETTERS)
def test_words_are_sorted_and_unique(letters: int) -> None:
    """One sorted entry per word, so the menu's count is the real number of words."""
    words = entries(source(SOURCES[letters]))
    assert sorted(set(words)) == words


@pytest.mark.parametrize("letters", LETTERS)
def test_header_states_the_count(letters: int) -> None:
    """The header comment's count matches the list."""
    text = source(SOURCES[letters])
    assert f"({len(entries(text)):,} of them)" in text


def test_game_secrets_are_words() -> None:
    """Real games' secrets are known, so the words-left count can reach them."""
    words = entries(source(SOURCES[4]))
    for path in (ROOT / "tests" / "games").glob("*.json"):
        assert json.loads(path.read_text())["secret"] in words, path.name


@pytest.mark.parametrize("letters", LETTERS)
def test_common_words_are_dictionary_words(letters: int) -> None:
    """Learn words only shows words the game accepts, sorted and unique."""
    common = entries(source(COMMON_SOURCES[letters]))
    assert sorted(set(common)) == common
    assert set(common) <= set(entries(source(SOURCES[letters])))


@pytest.mark.parametrize("letters", LETTERS)
def test_common_header_states_the_count(letters: int) -> None:
    """The common list's header comment's count matches the list."""
    text = source(COMMON_SOURCES[letters])
    assert f"({len(entries(text)):,} of them)" in text
