"""Staging copies of the page keep their notes and duel apart from the live game."""

import importlib.util
import json
import shutil
import subprocess
from pathlib import Path
from typing import TYPE_CHECKING

import pytest

if TYPE_CHECKING:
    from types import ModuleType

ROOT = Path(__file__).parent.parent
WEB = ROOT / "web"


def build_site() -> ModuleType:
    """Load .github/scripts/build_site.py, which isn't a package."""
    path = ROOT / ".github" / "scripts" / "build_site.py"
    spec = importlib.util.spec_from_file_location("build_site", path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_staging_copy_has_its_own_storage(tmp_path: Path) -> None:
    """Every key, cache and name the live game uses is renamed in a staging copy.

    If one of them is renamed in web/, this fails, rather than a staging copy
    quietly sharing the live game's saved notes.
    """
    site = build_site()
    copy = tmp_path / "copy"
    shutil.copytree(WEB, copy)
    site.separate(copy, "feat/duel-sheet")
    for name, old, new in site.SEPARATE:
        if (WEB / name).is_file():
            text = (copy / name).read_text()
            assert old not in text
            assert new.format(slug="feat-duel-sheet", branch="feat/duel-sheet") in text
    manifest = json.loads((copy / "manifest.webmanifest").read_text())
    assert manifest["name"] == "Word staging: feat/duel-sheet"
    assert manifest["start_url"] == "./"  # still the copy's own folder


def test_staging_copy_without_its_text_is_refused(tmp_path: Path) -> None:
    """A copy whose storage key can't be renamed is not staged at all."""
    site = build_site()
    copy = tmp_path / "copy"
    shutil.copytree(WEB, copy)
    app = copy / "app.js"
    app.write_text(app.read_text().replace("STORAGE_KEY = ", "SAVED_AS = "))
    with pytest.raises(site.StageError):
        site.separate(copy, "feat/renamed")


def test_branch_folders() -> None:
    """Branch names become one folder name each."""
    slug_of = build_site().slug_of
    assert slug_of("feat/duel-sheet") == "feat-duel-sheet"
    assert slug_of("claude/Blissful_volta") == "claude-blissful-volta"


@pytest.mark.skipif(
    not (ROOT / ".git").exists()
    or not subprocess.run(
        ["git", "tag", "--list", "v*"],  # noqa: S607 - git from PATH
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    ).stdout,
    reason="needs the git history and a release tag",
)
def test_live_site_is_the_latest_release(tmp_path: Path) -> None:
    """The root is the highest v* tag, stamped with its version."""
    site = build_site()
    out = tmp_path / "site"
    assert site.main(["build_site.py", str(out)]) == 0
    tag = site.git("tag", "--list", "v*", "--sort=-v:refname").splitlines()[0]
    assert f'<span class="version">{tag}</span>' in (out / "index.html").read_text()
    assert (out / "staging" / "index.html").is_file()
