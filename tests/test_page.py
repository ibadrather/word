"""The page works on its own, so GitHub Pages can serve it as plain files."""

import json
import re
import struct
from pathlib import Path

WEB = Path(__file__).parent.parent / "web"
# The worker itself, and the font licence
NOT_SERVED_OFFLINE = {"sw.js", "fonts/OFL.txt"}


def test_page_never_calls_the_server() -> None:
    """Once loaded, the page works on its own: no sockets, polling or requests.

    Two exceptions: the service worker fetches the page's own files to keep
    copies for offline use, and the duel clock reaches public relays
    through trystero.js, only once you join a room.
    """
    code = "".join(
        path.read_text()
        for path in WEB.glob("*.js")
        if path.name not in {"sw.js", "trystero.js"}
    )
    for call in ("fetch(", "WebSocket", "XMLHttpRequest", "EventSource", "sendBeacon"):
        assert call not in code


def test_only_the_clock_imports_the_library() -> None:
    """trystero.js reaches the network, so only the clock loads it, and only on demand.

    Its first line pins the version it was built from.
    """
    importers = sorted(
        path.name
        for path in WEB.rglob("*")
        if path.suffix in {".js", ".html"}
        and re.search(r"import\b.*trystero\.js", path.read_text())
    )
    assert importers == ["clock.js"]
    assert 'import("./trystero.js")' in (WEB / "clock.js").read_text()
    assert "Trystero 0.26.0" in (WEB / "trystero.js").read_text().splitlines()[0]


def test_page_has_a_version_slot() -> None:
    """The deploy swaps this placeholder for the release version; keep it as is."""
    assert (WEB / "index.html").read_text().count(
        '<span class="version">dev</span>'
    ) == 1


def test_page_loads_nothing_from_other_sites() -> None:
    """Every file the page uses lives in web/, so it opens the same offline."""
    links = re.findall(r'(?:href|src)="([^"]*)"', (WEB / "index.html").read_text())
    links += re.findall(r'url\("?([^")]*)', (WEB / "style.css").read_text())
    for link in links:
        if not link.startswith("data:"):
            assert (WEB / link).is_file(), link


def test_service_worker_keeps_every_file() -> None:
    """The worker's list matches web/: a file left off it would be missing offline."""
    listed = re.search(
        r"const FILES = \[(.*?)\];", (WEB / "sw.js").read_text(), re.DOTALL
    )
    assert listed is not None
    files = set(re.findall(r'"([^"]+)"', listed[1])) - {"./"}
    served = {
        path.relative_to(WEB).as_posix()
        for path in WEB.rglob("*")
        if path.is_file() and not path.name.startswith(".")  # not .DS_Store
    }
    assert files == served - NOT_SERVED_OFFLINE


def test_service_worker_ignores_the_query() -> None:
    """A shared duel link (?room=...) must open offline too.

    The worker keeps the page without a query, so offline it has to look the
    request up with ignoreSearch, or a link would find nothing.
    """
    assert "ignoreSearch: true" in (WEB / "sw.js").read_text()


def png_size(path: Path) -> str:
    """Read a PNG's size from its header, written as the manifest writes it."""
    width, height = struct.unpack(">II", path.read_bytes()[16:24])
    return f"{width}x{height}"


def test_manifest_icons() -> None:
    """Each app icon has the size the manifest says; Android gets a maskable one."""
    manifest = json.loads((WEB / "manifest.webmanifest").read_text())
    for icon in manifest["icons"]:
        assert png_size(WEB / icon["src"]) == icon["sizes"], icon["src"]
    sizes = {icon["sizes"] for icon in manifest["icons"] if icon["purpose"] == "any"}
    assert {"192x192", "512x512"} <= sizes
    assert any(icon["purpose"] == "maskable" for icon in manifest["icons"])
