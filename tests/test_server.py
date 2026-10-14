"""The server hands out the page, and the page never calls back."""

import threading
import urllib.request
from http import HTTPStatus

from word import STATIC, make_server


def test_serves_the_page() -> None:
    """The page and its CSS, JS and icon are served."""
    with make_server(0, host="127.0.0.1") as server:
        threading.Thread(target=server.serve_forever, daemon=True).start()
        base = f"http://127.0.0.1:{server.server_address[1]}"
        for path in ("/", "/style.css", "/app.js", "/helpers.js", "/icon.png"):
            with urllib.request.urlopen(base + path) as response:
                assert response.status == HTTPStatus.OK
        server.shutdown()


def test_page_never_calls_the_server() -> None:
    """Once loaded, the page works on its own: no sockets, polling or requests."""
    code = "".join(path.read_text() for path in STATIC.glob("*.js"))
    for call in ("fetch(", "WebSocket", "XMLHttpRequest", "EventSource", "sendBeacon"):
        assert call not in code
