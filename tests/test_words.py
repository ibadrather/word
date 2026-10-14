"""The dictionary in web/words.js is clean and knows the secrets in tests/games/."""

import json
import re
from pathlib import Path

ROOT = Path(__file__).parent.parent
SOURCE = (ROOT / "web" / "words.js").read_text()
WORDS = " ".join(re.findall(r'^ {2}"([a-z ]+)",$', SOURCE, re.MULTILINE)).split(" ")


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
