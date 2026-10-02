"""Cases both rasterizers must agree on (``fixtures/doodle-raster-parity.json``).

The browser's rasterizer (``packages/core/src/doodle/raster.ts``) is tested against the
same file, so a change to either side shows up as a failing test on the other.
"""

import json
import math
from pathlib import Path
from typing import Any

from afterglow_ml.raster import Point, doodle_image


def _wobbly_circle(cx: float, cy: float, r: float, n: int) -> list[Point]:
    return [
        (
            cx + (r + 6 * math.sin(k * 0.7)) * math.cos(2 * math.pi * k / n),
            cy + (r + 6 * math.sin(k * 0.7)) * math.sin(2 * math.pi * k / n),
        )
        for k in range(n + 1)
    ]


def parity_cases() -> list[dict[str, Any]]:
    """Strokes like Quick, Draw!'s (integers 0-255) and like Afterglow's (dense canvas floats)."""
    cases: dict[str, list[list[Point]]] = {
        "empty": [],
        "dot": [[(120.0, 80.0)]],
        "horizontal line": [[(0.0, 0.0), (255.0, 0.0)]],
        "quick draw house": [
            [
                (10.0, 250.0),
                (10.0, 120.0),
                (128.0, 10.0),
                (245.0, 120.0),
                (245.0, 250.0),
                (10.0, 250.0),
            ],
            [(100.0, 250.0), (100.0, 180.0), (150.0, 180.0), (150.0, 250.0)],
        ],
        "afterglow circle": [_wobbly_circle(640.3, 410.7, 150.0, 140)],
        "afterglow face": [
            _wobbly_circle(600.0, 400.0, 160.0, 120),
            [(540.0 + k * 0.3, 350.0 + math.sin(k / 3) * 2) for k in range(12)],
            [(650.0 + k * 0.3, 350.0 + math.sin(k / 3) * 2) for k in range(12)],
            [(520.0 + k * 8, 460.0 + 30 * math.sin(math.pi * k / 20)) for k in range(21)],
        ],
        "tall thin stroke": [[(500.0, 100.0 + k * 9.5) for k in range(80)]],
    }
    return [
        {
            "name": name,
            "strokes": [[[round(x, 6), round(y, 6)] for x, y in s] for s in strokes],
            "pixels": [round(float(v), 6) for v in doodle_image(_rounded(strokes)).reshape(-1)],
        }
        for name, strokes in cases.items()
    ]


def _rounded(strokes: list[list[Point]]) -> list[list[Point]]:
    # The file stores coordinates to 6 decimals; compute from exactly what it stores.
    return [[(round(x, 6), round(y, 6)) for x, y in s] for s in strokes]


def write_parity(path: Path) -> None:
    path.write_text(json.dumps({"size": 28, "cases": parity_cases()}, indent=None) + "\n", "utf-8")
