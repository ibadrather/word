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
    for files, old, new in site.SEPARATE:
        path = site.first_file(WEB, files)
        if path is not None:
            text = (copy / path.name).read_text()
            assert old not in text
            filled = new.format(
                folder="staging/feat-duel-sheet", name="Word staging: feat/duel-sheet"
            )
            assert filled in text
    manifest = json.loads((copy / "manifest.webmanifest").read_text())
    assert manifest["name"] == "Word staging: feat/duel-sheet"
    assert manifest["start_url"] == "./"  # still the copy's own folder


def test_beta_has_its_own_storage(tmp_path: Path) -> None:
    """The staging branch is the beta, with its own keys, cache and app name."""
    site = build_site()
    copy = tmp_path / "copy"
    shutil.copytree(WEB, copy)
    site.separate(copy, "staging")
    assert 'STORAGE_KEY = "guess-word-v2:beta"' in (copy / "app.js").read_text()
    assert "<title>Word beta</title>" in (copy / "index.html").read_text()
    manifest = json.loads((copy / "manifest.webmanifest").read_text())
    assert (manifest["name"], manifest["short_name"]) == ("Word beta", "Word beta")


def test_beta_has_its_own_icons(tmp_path: Path) -> None:
    """The beta's icons say BETA; another branch's copy keeps the live icons."""
    site = build_site()
    icons = sorted(icon.name for icon in site.BETA_ICONS.glob("*.png"))
    assert icons == sorted(icon.name for icon in WEB.glob("icon*.png"))
    for branch, source in (("staging", site.BETA_ICONS), ("feat/x", WEB)):
        copy = tmp_path / site.slug_of(branch)
        shutil.copytree(WEB, copy)
        site.separate(copy, branch)
        for icon in icons:
            assert (copy / icon).read_bytes() == (source / icon).read_bytes()


APP_ID = 'const APP_ID = "ibadrather-word"'
STAGED_APP_ID = 'const APP_ID = "ibadrather-word:staging/feat-x"'


def test_app_id_in_clock_js_is_separated(tmp_path: Path) -> None:
    """An older branch, with the app id in clock.js and no room.js, is staged."""
    site = build_site()
    copy = tmp_path / "copy"
    shutil.copytree(WEB, copy)
    (copy / "room.js").unlink(missing_ok=True)
    clock = copy / "clock.js"
    if APP_ID not in clock.read_text():
        clock.write_text(f"{APP_ID};\n{clock.read_text()}")
    site.separate(copy, "feat/x")
    assert STAGED_APP_ID in clock.read_text()


def test_app_id_in_room_js_is_separated(tmp_path: Path) -> None:
    """A newer branch is staged: the app id in room.js, a clock.js without it."""
    site = build_site()
    copy = tmp_path / "copy"
    shutil.copytree(WEB, copy)
    clock = copy / "clock.js"
    clock.write_text(clock.read_text().replace(f"{APP_ID};\n", ""))
    assert APP_ID not in clock.read_text()
    room = copy / "room.js"
    if not room.is_file():
        room.write_text(f"{APP_ID};\n")
    site.separate(copy, "feat/x")
    assert STAGED_APP_ID in room.read_text()


def test_group_storage_is_separated(tmp_path: Path) -> None:
    """The group game's storage key is renamed when the branch has group.js."""
    site = build_site()
    copy = tmp_path / "copy"
    shutil.copytree(WEB, copy)
    group = copy / "group.js"
    if not group.is_file():
        group.write_text('const STORAGE_KEY = "word-group";\n')
    site.separate(copy, "feat/x")
    assert 'STORAGE_KEY = "word-group:staging/feat-x"' in group.read_text()


def test_branch_without_group_js_is_staged(tmp_path: Path) -> None:
    """A branch without group.js skips its entry and is still staged."""
    site = build_site()
    copy = tmp_path / "copy"
    shutil.copytree(WEB, copy)
    (copy / "group.js").unlink(missing_ok=True)
    site.separate(copy, "feat/x")
    assert not (copy / "group.js").exists()
    assert (
        'STORAGE_KEY = "guess-word-v2:staging/feat-x"' in (copy / "app.js").read_text()
    )


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


def test_beta_folder() -> None:
    """The staging branch goes to beta/, and every other branch under staging/."""
    folder_of = build_site().folder_of
    assert folder_of("staging") == "beta"
    assert folder_of("feat/duel-sheet") == "staging/feat-duel-sheet"
    assert folder_of("beta") == "staging/beta"  # a branch called beta isn't the beta


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
