"""The dictionary in web/words.js is clean and knows the secrets in tests/games/.

Its common words in web/common.js, for Learn words, are clean too.
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).parent.parent
SOURCE = (ROOT / "web" / "words.js").read_text()
COMMON_SOURCE = (ROOT / "web" / "common.js").read_text()


def entries(source: str) -> list[str]:
    """Read the words from a word list's string lines."""
    return " ".join(re.findall(r'^ {2}"([a-z ]+)",$', source, re.MULTILINE)).split(" ")


WORDS = entries(SOURCE)
COMMON = entries(COMMON_SOURCE)


def test_words_are_four_lowercase_letters() -> None:
    """Every entry is 4 letters a-z, so lookups of a typed word work."""
    assert all(re.fullmatch("[a-z]{4}", word) for word in WORDS)


def test_words_are_sorted_and_unique() -> None:
    """One sorted entry per word, so the menu's count is the real number of words."""
    assert sorted(set(WORDS)) == WORDS


def test_header_states_the_count() -> None:
    """The header comment's count matches the list."""
    assert f"({len(WORDS):,} of them)" in SOURCE


def test_game_secrets_are_words() -> None:
    """Real games' secrets are known, so the words-left count can reach them."""
    for path in (ROOT / "tests" / "games").glob("*.json"):
        assert json.loads(path.read_text())["secret"] in WORDS, path.name


def test_common_words_are_dictionary_words() -> None:
    """Learn words only shows words the game accepts, sorted and unique."""
    assert sorted(set(COMMON)) == COMMON
    assert set(COMMON) <= set(WORDS)


def test_common_header_states_the_count() -> None:
    """The common list's header comment's count matches the list."""
    assert f"({len(COMMON):,} of them)" in COMMON_SOURCE
