"""Build the GitHub Pages site: the latest release, the beta and the staging copies.

Usage: build_site.py <out>

The root of <out> is web/ as of the highest v* tag, with its version stamped
into the menu, so only released versions are live. The staging branch is the
beta, at beta/ (https://ibadrather.github.io/word/beta/). Every other branch on
origin (all but main) goes to staging/<slug>/, so feat/duel-sheet is at
https://ibadrather.github.io/word/staging/feat-duel-sheet/, and staging/ lists
them all, the beta too. A deleted branch drops out on the next deploy.

All project pages on ibadrather.github.io share one browser origin, so a
staging copy gets its own storage keys, offline cache and app name: testing it
never touches the live game's notes, duel rooms or installed app. A branch that can't
be staged is skipped with a warning, so it never holds up a release.
"""

import html
import io
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tarfile
import tomllib

DEFAULT_BRANCH = "main"
BETA_BRANCH = "staging"  # its copy is the beta, at beta/ rather than staging/staging/
VERSION_SLOT = '<span class="version">dev</span>'

# What keeps a staging copy apart from the live game: (file, text, replacement).
# {folder} (staging/<slug>, or beta) and {name} are filled in. The duel's app id
# keeps its rooms apart too, so a staging phone only ever meets another phone on
# the same branch. A file the branch doesn't have is skipped (main has no
# clock.js); one that has lost its text stops the branch, as its copy would
# share the live game's storage.
SEPARATE = (
    (
        "app.js",
        'const STORAGE_KEY = "guess-word-v2"',
        'const STORAGE_KEY = "guess-word-v2:{folder}"',
    ),
    (
        "clock.js",
        'const STORAGE_KEY = "word-clock"',
        'const STORAGE_KEY = "word-clock:{folder}"',
    ),
    (
        "clock.js",
        'const APP_ID = "ibadrather-word"',
        'const APP_ID = "ibadrather-word:{folder}"',
    ),
    (
        "sw.js",
        'const CACHE = "guess-word"',
        'const CACHE = "guess-word:{folder}"',
    ),
    ("index.html", "<title>Word</title>", "<title>{name}</title>"),
)


class StageError(Exception):
    """A branch's files aren't what the staging copy expects."""


def git(*args: str) -> str:
    """Run git and return its trimmed output."""
    result = subprocess.run(["git", *args], check=True, capture_output=True, text=True)
    return result.stdout.strip()


def export(ref: str, dest: pathlib.Path) -> None:
    """Write the files in web/ as they are at ref into dest."""
    archive = subprocess.run(
        ["git", "archive", "--format=tar", f"{ref}:web"],
        check=True,
        capture_output=True,
    ).stdout
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        tar.extractall(dest, filter="data")


def version_at(ref: str) -> str:
    """Return the version in pyproject.toml at ref."""
    return str(
        tomllib.loads(git("show", f"{ref}:pyproject.toml"))["project"]["version"]
    )


def replace_once(path: pathlib.Path, old: str, new: str) -> None:
    """Swap old for new in path, which must hold old exactly once."""
    text = path.read_text()
    if text.count(old) != 1:
        message = f"{path.name} has {old!r} {text.count(old)} times, not once"
        raise StageError(message)
    path.write_text(text.replace(old, new))


def stamp(site: pathlib.Path, label: str) -> None:
    """Write label where the menu shows the version."""
    replace_once(
        site / "index.html", VERSION_SLOT, f'<span class="version">{label}</span>'
    )


def slug_of(branch: str) -> str:
    """Make a branch name into one folder name: feat/duel-sheet -> feat-duel-sheet."""
    return re.sub(r"[^a-z0-9]+", "-", branch.lower()).strip("-")


def folder_of(branch: str) -> str:
    """Return where a branch's copy goes: beta for staging, else staging/<slug>."""
    return "beta" if branch == BETA_BRANCH else f"staging/{slug_of(branch)}"


def app_name(branch: str) -> str:
    """Return the copy's title and installed-app name."""
    return "Word beta" if branch == BETA_BRANCH else f"Word staging: {branch}"


def separate(site: pathlib.Path, branch: str) -> None:
    """Give a staging copy its own storage, offline cache and app name."""
    folder, name = folder_of(branch), app_name(branch)
    for file, old, new in SEPARATE:
        path = site / file
        if path.is_file():
            replace_once(path, old, new.format(folder=folder, name=html.escape(name)))
    manifest = site / "manifest.webmanifest"
    if manifest.is_file():
        data = json.loads(manifest.read_text())
        data["name"] = name
        data["short_name"] = "Word beta" if branch == BETA_BRANCH else "Word test"
        manifest.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


def branches() -> list[str]:
    """Return every branch on origin but the default one."""
    names = git("for-each-ref", "--format=%(refname:lstrip=3)", "refs/remotes/origin")
    return sorted(set(names.splitlines()) - {"HEAD", DEFAULT_BRANCH})


def stage(out: pathlib.Path, branch: str) -> str:
    """Build branch's staging copy under out and return its folder."""
    folder = folder_of(branch)
    site = out / folder
    if site.exists():
        message = f"its folder {folder} is taken by another branch"
        raise StageError(message)
    ref = f"origin/{branch}"
    site.mkdir(parents=True)
    try:
        export(ref, site)
        commit = git("rev-parse", "--short", ref)
        where = "beta" if branch == BETA_BRANCH else f"staging {branch}"
        label = f"v{version_at(ref)} · {where} @ {commit}"
        stamp(site, html.escape(label))
        separate(site, branch)
    except Exception:
        shutil.rmtree(site, ignore_errors=True)
        raise
    return folder


def index(staged: dict[str, str]) -> str:
    """List the staging copies on one plain page, from inside staging/."""
    items = "".join(
        f'<li><a href="{os.path.relpath(folder, "staging")}/">{html.escape(branch)}</a>'
        f"{' (the beta)' if branch == BETA_BRANCH else ''}</li>"
        for branch, folder in staged.items()
    )
    return (
        '<!doctype html>\n<html lang="en">\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        "<title>Word staging</title>\n"
        '<body style="font: 16px/1.5 system-ui, sans-serif; margin: 24px">\n'
        "<h1>Word staging</h1>\n"
        "<p>One copy per branch, each with its own notes and duel, apart from"
        ' <a href="../">the live game</a>.</p>\n'
        f"<ul>{items or '<li>No branches to stage.</li>'}</ul>\n"
    )


def summary(line: str) -> None:
    """Print a line, and add it to the GitHub job summary when there is one."""
    print(line)
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        with pathlib.Path(path).open("a") as handle:
            handle.write(line + "\n")


def main(argv: list[str]) -> int:
    """Build the site into the folder given in argv."""
    if len(argv) != 2:  # noqa: PLR2004 - the script and the folder
        print(__doc__)
        return 2
    out = pathlib.Path(argv[1])
    out.mkdir(parents=True)  # a fresh folder, so nothing old is published by accident

    tags = git("tag", "--list", "v*", "--sort=-v:refname").splitlines()
    if not tags:
        print("::error::No v* tag to publish; release a version first.")
        return 1
    export(tags[0], out)
    stamp(out, f"v{version_at(tags[0])}")
    summary(f"Live: {tags[0]}")

    staged = {}
    for branch in branches():
        try:
            staged[branch] = stage(out, branch)
        except Exception as error:  # noqa: BLE001 - one branch never stops the release
            detail = getattr(error, "stderr", None) or error
            print(f"::warning::Not staging {branch}: {str(detail).strip()}")
            continue
        summary(f"Staging: {branch} at {staged[branch]}/")
    (out / "staging").mkdir(exist_ok=True)
    (out / "staging" / "index.html").write_text(index(staged))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
