"""Downloads a subset of Quick, Draw!'s simplified drawings (ADR 0015).

Each class's file is streamed from Google's public bucket and only its first ``per_class``
recognized drawings are kept, so the download stops early instead of fetching whole
files (up to hundreds of MB each). Files land in ``data/raw/<class>.ndjson``; a class
that already has enough drawings is skipped, so an interrupted run picks up where it
stopped.
"""

import ssl
import urllib.parse
import urllib.request
from collections.abc import Iterable
from pathlib import Path

from afterglow_ml.quickdraw import DrawingFormatError, parse_drawing

BASE_URL = "https://storage.googleapis.com/quickdraw_dataset/full/simplified/"


def class_url(word: str) -> str:
    return BASE_URL + urllib.parse.quote(f"{word}.ndjson")


def keep_recognized(lines: Iterable[str], count: int) -> list[str]:
    """The first ``count`` lines that parse and that Quick, Draw!'s own model recognized."""
    kept: list[str] = []
    for line in lines:
        if len(kept) >= count:
            break
        if not line.strip():
            continue
        try:
            drawing = parse_drawing(line)
        except DrawingFormatError:
            continue
        if drawing.recognized:
            kept.append(line.rstrip("\n"))
    return kept


SYSTEM_CERTS = Path("/etc/ssl/cert.pem")


def _tls_context() -> ssl.SSLContext:
    """Verified TLS. Python from python.org on macOS loads no root certificates of its own,
    so the system's bundle is used when none were found."""
    context = ssl.create_default_context()
    if context.cert_store_stats()["x509_ca"] == 0 and SYSTEM_CERTS.exists():
        context.load_verify_locations(cafile=str(SYSTEM_CERTS))
    return context


def _stream_lines(url: str) -> Iterable[str]:
    with urllib.request.urlopen(url, timeout=60, context=_tls_context()) as response:
        for raw in response:
            yield raw.decode("utf-8")


def download_class(word: str, out_dir: Path, per_class: int) -> int:
    """Downloads one class; returns how many drawings its file holds."""
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{word}.ndjson"
    if path.exists():
        existing = sum(1 for line in path.read_text("utf-8").splitlines() if line.strip())
        if existing >= per_class:
            return existing
    lines = keep_recognized(_stream_lines(class_url(word)), per_class)
    tmp = path.with_suffix(".part")
    tmp.write_text("\n".join(lines) + "\n", "utf-8")
    tmp.replace(path)
    return len(lines)
