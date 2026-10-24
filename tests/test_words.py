"""The dictionaries in web/words.js and web/words5.js are clean.

The 4-letter one knows the secrets in tests/games/. Their common words in
web/common.js and web/common5.js, for Learn words and the group game's deal,
are clean too.
"""

import json
import re
from pathlib import Path

import pytest
from word_lists import COMMON_SOURCES, LETTERS, SOURCES, entries, source

ROOT = Path(__file__).parent.parent
# The common words that end in s without being a plural
NOT_PLURAL = set(
    re.findall(
        "[a-z]+",
        """alas bias hers lens news ours anus axis bass boss dais fuss hiss iris kiss
        lass less loss mass mess miss moss muss onus opus pass plus puss this thus
        alias atlas chaos corps ethos kudos mumps yours abyss amass amiss basis
        bless bliss bogus bonus brass chess class crass cross dress dross fetus
        floss focus genus glass gloss grass gross guess lotus minus mucus oasis
        penis pious press sinus virus""",
    )
)


@pytest.mark.parametrize("letters", LETTERS)
def test_words_are_lowercase_letters(letters: int) -> None:
    """Every entry is 4 (or 5) letters a-z, so lookups of a typed word work."""
    words = entries(SOURCES[letters])
    assert all(re.fullmatch(f"[a-z]{{{letters}}}", word) for word in words)


@pytest.mark.parametrize("letters", LETTERS)
def test_words_are_sorted_and_unique(letters: int) -> None:
    """One sorted entry per word, so the menu's count is the real number of words."""
    words = entries(SOURCES[letters])
    assert sorted(set(words)) == list(words)


@pytest.mark.parametrize("letters", LETTERS)
def test_header_states_the_count(letters: int) -> None:
    """The header comment's count matches the list."""
    name = SOURCES[letters]
    text = source(name)
    assert f"({len(entries(name)):,} of them)" in text


def test_game_secrets_are_words() -> None:
    """Real games' secrets are known, so the words-left count can reach them."""
    for path in (ROOT / "tests" / "games").glob("*.json"):
        secret = json.loads(path.read_text())["secret"]
        assert secret in entries(SOURCES[len(secret)]), path.name


@pytest.mark.parametrize("letters", LETTERS)
def test_common_words_are_dictionary_words(letters: int) -> None:
    """Learn words only shows words the game accepts, sorted and unique."""
    common = entries(COMMON_SOURCES[letters])
    assert sorted(set(common)) == list(common)
    assert set(common) <= set(entries(SOURCES[letters]))


@pytest.mark.parametrize("letters", LETTERS)
def test_common_words_are_not_plurals(letters: int) -> None:
    """The group game never deals a plural.

    A common word ends in s only if it isn't one.
    """
    common = entries(COMMON_SOURCES[letters])
    assert {word for word in common if word.endswith("s")} <= NOT_PLURAL
    assert not {"mice", "geese", "teeth", "women"} & set(common)


@pytest.mark.parametrize("letters", LETTERS)
def test_common_header_states_the_count(letters: int) -> None:
    """The common list's header comment's count matches the list."""
    name = COMMON_SOURCES[letters]
    text = source(name)
    assert f"({len(entries(name)):,} of them)" in text


def test_meanings_are_for_words_the_game_deals() -> None:
    """Every meaning is for a common word, sorted and one each, and says something."""
    meanings = re.findall(
        r'^ {2}([a-z]+): "(.+)",$', source("meanings.js"), re.MULTILINE
    )
    words = [word for word, _ in meanings]
    assert sorted(set(words)) == words
    common = {word for name in COMMON_SOURCES.values() for word in entries(name)}
    assert set(words) <= common
    assert all(meaning.strip() for _, meaning in meanings)
    assert f"({len(words):,} of them)" in source("meanings.js")
