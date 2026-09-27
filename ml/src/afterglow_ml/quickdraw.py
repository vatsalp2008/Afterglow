"""Parsing for the Quick, Draw! "simplified" NDJSON drawing format.

Each line is one drawing. In the simplified format every stroke is a pair of
equal-length coordinate lists ``[xs, ys]``, aligned to the top-left, scaled so
the longest side spans 0-255, and resampled with 1-pixel spacing. See
https://github.com/googlecreativelab/quickdraw-dataset#simplified-drawing-files-ndjson
"""

import json
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from typing import Any

MAX_COORD = 255

Stroke = tuple[tuple[int, ...], tuple[int, ...]]


class DrawingFormatError(ValueError):
    """A line doesn't match the simplified drawing format."""


@dataclass(frozen=True, slots=True)
class Drawing:
    key_id: str
    word: str
    countrycode: str
    recognized: bool
    strokes: tuple[Stroke, ...]

    @property
    def point_count(self) -> int:
        return sum(len(xs) for xs, _ in self.strokes)


def _coords(values: object, where: str) -> tuple[int, ...]:
    if not isinstance(values, list) or not all(
        isinstance(v, int) and not isinstance(v, bool) for v in values
    ):
        raise DrawingFormatError(f"{where}: expected a list of integers")
    if any(v < 0 or v > MAX_COORD for v in values):
        raise DrawingFormatError(f"{where}: coordinates must be within 0-{MAX_COORD}")
    return tuple(values)


def _text(raw: dict[str, Any], field: str) -> str:
    value = raw.get(field)
    if not isinstance(value, str) or not value:
        raise DrawingFormatError(f"{field}: expected a non-empty string")
    return value


def parse_drawing(line: str) -> Drawing:
    """Parses one NDJSON line, raising DrawingFormatError if it isn't valid."""
    try:
        raw = json.loads(line)
    except json.JSONDecodeError as err:
        raise DrawingFormatError(f"invalid JSON: {err.msg}") from err
    if not isinstance(raw, dict):
        raise DrawingFormatError("expected a JSON object")

    drawing = raw.get("drawing")
    if not isinstance(drawing, list) or not drawing:
        raise DrawingFormatError("drawing: expected a non-empty list of strokes")
    strokes: list[Stroke] = []
    for i, stroke in enumerate(drawing):
        if not isinstance(stroke, list) or len(stroke) != 2:
            raise DrawingFormatError(f"stroke {i}: expected [xs, ys]")
        xs = _coords(stroke[0], f"stroke {i} x")
        ys = _coords(stroke[1], f"stroke {i} y")
        if not xs or len(xs) != len(ys):
            raise DrawingFormatError(f"stroke {i}: xs and ys must be non-empty and equal length")
        strokes.append((xs, ys))

    return Drawing(
        key_id=str(raw.get("key_id", "")),
        word=_text(raw, "word"),
        countrycode=str(raw.get("countrycode", "")),
        recognized=bool(raw.get("recognized", False)),
        strokes=tuple(strokes),
    )


def iter_drawings(lines: Iterable[str]) -> Iterator[Drawing]:
    """Parses every non-blank line. Errors name the 1-based line number."""
    for number, line in enumerate(lines, start=1):
        if not line.strip():
            continue
        try:
            yield parse_drawing(line)
        except DrawingFormatError as err:
            raise DrawingFormatError(f"line {number}: {err}") from err
