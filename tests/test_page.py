"""The page works on its own, so GitHub Pages can serve it as plain files."""

from pathlib import Path

WEB = Path(__file__).parent.parent / "web"


def test_page_never_calls_the_server() -> None:
    """Once loaded, the page works on its own: no sockets, polling or requests."""
    code = "".join(path.read_text() for path in WEB.glob("*.js"))
    for call in ("fetch(", "WebSocket", "XMLHttpRequest", "EventSource", "sendBeacon"):
        assert call not in code


def test_page_has_a_version_slot() -> None:
    """The deploy swaps this placeholder for the release version; keep it as is."""
    assert (WEB / "index.html").read_text().count(
        '<span class="version">dev</span>'
    ) == 1
