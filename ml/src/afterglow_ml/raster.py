"""Strokes to the 28x28 image the doodle model sees (ADR 0015).

The browser runs the same steps (``packages/core/src/doodle/raster.ts``), and
``fixtures/doodle-raster-parity.json`` holds cases both test suites check, so the model
sees the same pixels in training and in the studio.

1. ``prepare``: Quick, Draw!'s "simplified" form. Aligned to the top left, scaled so the
   longer side spans 0-255, and simplified with Douglas-Peucker at 2 units. Quick, Draw!
   data is already in this form; strokes drawn in Afterglow aren't.
2. ``rasterize``: fitted into the image with a margin and centered, then drawn as lines
   about 2 pixels wide with a soft 1-pixel edge: a pixel's value is how close its center
   is to the nearest segment.
"""

from collections.abc import Sequence
from itertools import pairwise

import numpy as np
from numpy.typing import NDArray

Point = tuple[float, float]
Polyline = list[Point]

SIZE = 28
MARGIN = 2.0
HALF_WIDTH = 1.0
SIMPLIFY_EPSILON = 2.0
SPAN = 255.0


def _segment_distance(p: Point, a: Point, b: Point) -> float:
    dx = b[0] - a[0]
    dy = b[1] - a[1]
    length2 = dx * dx + dy * dy
    t = (
        0.0
        if length2 == 0
        else max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2))
    )
    return float(np.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t)))


def simplify(points: Sequence[Point], epsilon: float) -> Polyline:
    """Douglas-Peucker on an open polyline, keeping its ends. Matches ``simplify`` in core."""
    if len(points) < 3:
        return list(points)
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        start, end = stack.pop()
        worst = -1
        worst_distance = epsilon
        for i in range(start + 1, end):
            d = _segment_distance(points[i], points[start], points[end])
            if d > worst_distance:
                worst = i
                worst_distance = d
        if worst >= 0:
            keep[worst] = True
            stack.append((start, worst))
            stack.append((worst, end))
    return [p for p, k in zip(points, keep, strict=True) if k]


def prepare(strokes: Sequence[Sequence[Point]]) -> list[Polyline]:
    """Quick, Draw!'s simplified form: top-left aligned, longer side 0-255, simplified."""
    points = [p for s in strokes for p in s]
    if not points:
        return []
    min_x = min(p[0] for p in points)
    min_y = min(p[1] for p in points)
    side = max(max(p[0] for p in points) - min_x, max(p[1] for p in points) - min_y)
    scale = SPAN / side if side > 0 else 1.0
    out = []
    for stroke in strokes:
        if not stroke:
            continue
        moved = [((x - min_x) * scale, (y - min_y) * scale) for x, y in stroke]
        out.append(simplify(moved, SIMPLIFY_EPSILON))
    return out


def rasterize(strokes: Sequence[Sequence[Point]]) -> NDArray[np.float32]:
    """A SIZE x SIZE image in [0, 1], row-major, white strokes on black."""
    image = np.zeros((SIZE, SIZE), dtype=np.float64)
    points = [p for s in strokes for p in s]
    if not points:
        return image.astype(np.float32)
    min_x = min(p[0] for p in points)
    min_y = min(p[1] for p in points)
    width = max(p[0] for p in points) - min_x
    height = max(p[1] for p in points) - min_y
    side = max(width, height)
    inner = SIZE - 2 * MARGIN
    scale = inner / side if side > 0 else 1.0
    off_x = MARGIN + (inner - width * scale) / 2 - min_x * scale
    off_y = MARGIN + (inner - height * scale) / 2 - min_y * scale

    starts: list[Point] = []
    ends: list[Point] = []
    for stroke in strokes:
        mapped = [(x * scale + off_x, y * scale + off_y) for x, y in stroke]
        if len(mapped) == 1:
            starts.append(mapped[0])
            ends.append(mapped[0])
        for start, end in pairwise(mapped):
            starts.append(start)
            ends.append(end)
    a: NDArray[np.float64] = np.array(starts, dtype=np.float64)  # (S, 2)
    b: NDArray[np.float64] = np.array(ends, dtype=np.float64)
    cols, rows = np.meshgrid(np.arange(SIZE) + 0.5, np.arange(SIZE) + 0.5)
    px = cols.reshape(-1, 1)  # (P, 1)
    py = rows.reshape(-1, 1)
    dx = (b[:, 0] - a[:, 0])[None, :]  # (1, S)
    dy = (b[:, 1] - a[:, 1])[None, :]
    length2 = dx * dx + dy * dy
    safe = np.where(length2 == 0, 1.0, length2)
    t = ((px - a[None, :, 0]) * dx + (py - a[None, :, 1]) * dy) / safe
    t = np.where(length2 == 0, 0.0, np.clip(t, 0.0, 1.0))
    distance = np.hypot(px - (a[None, :, 0] + dx * t), py - (a[None, :, 1] + dy * t))
    nearest = distance.min(axis=1)
    pixels: NDArray[np.float32] = (
        np.clip(HALF_WIDTH + 0.5 - nearest, 0.0, 1.0).reshape(SIZE, SIZE).astype(np.float32)
    )
    return pixels


def doodle_image(strokes: Sequence[Sequence[Point]]) -> NDArray[np.float32]:
    """``prepare`` then ``rasterize``: what the model sees for any drawing."""
    return rasterize(prepare(strokes))
