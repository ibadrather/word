"""Serves the static notes page. Everything else happens in the browser."""

import contextlib
import logging
import socket
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import override

import click

STATIC = Path(__file__).parent / "static"
ALL_INTERFACES = "0.0.0.0"  # noqa: S104 - phones on the home Wi-Fi must reach it

log = logging.getLogger("guess_word")


class Handler(SimpleHTTPRequestHandler):
    """Serves files from static/. The page never talks back to the server."""

    @override
    def handle(self) -> None:
        # Browsers open spare connections and drop them; that's normal, not an error.
        with contextlib.suppress(ConnectionError):
            super().handle()

    @override
    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")  # always serve the latest version
        super().end_headers()

    @override
    def log_request(self, code: int | str = "-", size: int | str = "-") -> None:
        if self.path == "/":
            log.info("page sent to %s", self.client_address[0])

    @override
    def log_error(self, format: str, *args: object) -> None:
        pass  # only page loads are worth printing


def make_server(port: int, host: str = ALL_INTERFACES) -> ThreadingHTTPServer:
    """Create a server for the static folder on host:port."""
    return ThreadingHTTPServer((host, port), partial(Handler, directory=STATIC))


def lan_ip() -> str:
    """Return this machine's address on the home network (no traffic is sent)."""
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        try:
            s.connect(("10.255.255.255", 1))
            return str(s.getsockname()[0])
        except OSError:
            return "127.0.0.1"


@click.command()
@click.option("--port", "-p", default=8501, show_default=True, help="Port to serve on.")
def main(port: int) -> None:
    """Start the Guess Word notes page."""
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%H:%M:%S"
    )
    with make_server(port) as server:
        log.info("Guess Word on http://%s:%d  (Ctrl+C to stop)", lan_ip(), port)
        with contextlib.suppress(KeyboardInterrupt):
            server.serve_forever()
